import {
  ModelAuthScheme,
  ModelProbeOutcome,
  RECORDING_TYPE_NOT_ACCEPTED,
  SERVICE_AUDIO_TYPES,
  TRANSCRIBER_UNAVAILABLE,
  TRANSCRIPTION_EMPTY,
  type ModelProbeResult,
  type TranscriberKind,
  TranscriptionState,
} from '@cairn/shared';
import { Logger } from '@nestjs/common';

import { probeOutcomeOf } from '../suggester/probe-outcome';
import type { RecordingStore } from './recording-store';
import type { TranscriberSettings } from './settings';
import {
  TranscriberFailure,
  type Transcriber,
  type TranscriptionAnswer,
  type TranscriptionInput,
} from './transcriber';
import { transcriptOf } from './transcript';

/**
 * Узел операций Yandex Cloud: он один на все службы облака.
 *
 * Настройкой не является намеренно: это не **наш** узел, а часть
 * подтверждённого устройства API v3 (таблица подтверждённого
 * документацией). Вынести его в переменную значило бы предложить
 * администратору настроить то, что он настроить не может.
 */
export const OPERATIONS_BASE_URL = 'https://operation.api.cloud.yandex.net';

/**
 * Идентификатор операции, которой нет и не будет.
 *
 * Нагрузка проверки связи — и вся нагрузка целиком: **ни байта записи и
 * ни байта данных проекта наружу не уходит**. Это то же требование, что у
 * проверки предложителя, только исполненное иначе: там наружу уходит
 * фраза-константа и модель на неё отвечает, здесь настоящий вызов означал
 * бы отправку аудио и оплату, поэтому спрашивается судьба работы, которой
 * не существует.
 *
 * Что проверка **выясняет**: дошли ли мы до настроенного адреса, принял ли
 * узел ключ и каталог. Что она **не** выясняет: возьмёт ли служба нашу
 * дорожку и хватит ли квоты, — об этом честно знает только расшифровка.
 *
 * Строка узнаваемая, а не случайная: она попадает в чужой лог, и человек
 * по ту сторону вправе понять, что это проверка, а не поломанный клиент.
 */
export const PROBE_OPERATION_ID = 'cairn-probe-nonexistent-operation';

/**
 * Как служба называет контейнеры (страница форматов SpeechKit).
 *
 * Только то, что служба принимает **как есть**: после появления извлечения
 * обычным случаем стал `OGG_OPUS`, а `MP3` и `WAV` приходят лишь с файлов,
 * прошедших мимо извлечения.
 */
const CONTAINER_BY_TYPE: Readonly<Record<string, string>> = {
  'audio/ogg': 'OGG_OPUS',
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
};

/**
 * Предел читаемого тела ответа, в знаках.
 *
 * Разбор чужого мегабайта — это наша память, а не их щедрость. Числом
 * больше, чем у предложителя: текст часового созвона — это сотни тысяч
 * знаков, и поток событий `getRecognition` их повторяет дважды (сырой и
 * нормализованный).
 */
const MAX_RESPONSE_CHARS = 8_000_000;

/**
 * Код ответа на проверку в исход — с одной поправкой к общему правилу.
 *
 * Общая {@link probeOutcomeOf} читает `404` как «узла или модели нет», и
 * для предложителя это верно: он спрашивает ручку, которая обязана быть.
 * Здесь спрашивается операция, которой **не должно** быть, и «не найдено»
 * — единственный ожидаемый успешный ответ. Поправка стоит здесь, а не в
 * общей функции: там она сломала бы смысл для предложителя.
 */
function outcomeOfProbe(status: number): ModelProbeOutcome {
  return status === 404 ? ModelProbeOutcome.Ok : probeOutcomeOf(status);
}

/** Ответ ручки операций в части, которая нас касается. */
interface OperationResponse {
  id?: unknown;
  done?: unknown;
  error?: unknown;
}

/**
 * Адаптер Yandex SpeechKit v3 (дизайн, 7.2).
 *
 * Дорожка уезжает **в теле запроса**, а не ссылкой на бакет: v3 принимает
 * `content` байтами, и бакет не нужен — значит у записи не появляется
 * второй долговременной копии вне нашей машины (дизайн, 3.1).
 *
 * **Неподтверждённого наружу не отправляется ни одного поля.** Опции
 * `text_normalization`, `language_restriction` и `audio_processing_type`
 * понятны по назначению, но не по написанию (пункт 3 таблицы проверок), и
 * до живого вызова адаптер шлёт минимальный набор — `model` и
 * `audio_format`. Негодный параметр дал бы `400` на каждом вызове, а
 * русский текст без расстановки пунктуации в разбивку годится.
 * `speaker_labeling` не отправляется по решению владельца: диаризации нет.
 * Заголовок `x-data-logging-enabled` не отправляется **никогда** — он
 * включает дообучение на нашем аудио, и он не наш.
 *
 * Повторов не делает — ни на `start`, ни на сетевой сбой: один вызов —
 * одна плата, а повтор это нажатие человека. Автоповтор на платном API был
 * бы способом удвоить счёт молча. Повтор опроса не повтор вызова, и он
 * идёт следующим тиком прогона, а не внутри адаптера.
 */
export class YandexSpeechKitTranscriber implements Transcriber {
  private readonly logger = new Logger(YandexSpeechKitTranscriber.name);

  /**
   * Настройки в истинно приватном поле, а не в `private readonly`.
   *
   * `private` в TypeScript — проверка компилятора, и только: в готовом
   * объекте поле остаётся обычным, а значит ключ API уехал бы наружу
   * первым же `JSON.stringify` порта. Поле с `#` недоступно ни снаружи, ни
   * сериализации. Так сделано у предложителя задач.
   */
  readonly #settings: TranscriberSettings;

  readonly #store: RecordingStore;

  constructor(settings: TranscriberSettings, store: RecordingStore) {
    this.#settings = settings;
    this.#store = store;
  }

  get kind(): TranscriberKind {
    return this.#settings.kind;
  }

  get model(): string {
    return this.#settings.model;
  }

  get host(): string | null {
    return this.#settings.host;
  }

  get maxSendBytes(): number {
    return this.#settings.maxSendBytes;
  }

  get serviceTypes(): string[] {
    return [...SERVICE_AUDIO_TYPES];
  }

  get isEnabled(): boolean {
    return this.#settings.isEnabled;
  }

  /**
   * Отдаёт дорожку службе и отвечает идентификатором операции.
   *
   * `running` без идентификатора — не исход, а отказ: опрашивать такую
   * работу нечем, и строка висела бы вечно на операции, о которой мы не
   * умеем спросить.
   */
  async start(input: TranscriptionInput, signal: AbortSignal): Promise<TranscriptionAnswer> {
    const container = containerTypeOf(input.audioType);

    if (container === null) {
      // До адаптера такой тип не доходит (`prepareDecision` его не
      // пропускает), но отправлять наружу запись, контейнер которой мы не
      // умеем назвать, нельзя: служба отвергла бы её после передачи.
      throw new TranscriberFailure(
        RECORDING_TYPE_NOT_ACCEPTED,
        'Служба не принимает такой контейнер дорожки.',
      );
    }

    const audio = await this.#store.read(input.audioPath);
    const payload = await this.ask(`${this.base()}/stt/v3/recognizeFileAsync`, {
      method: 'POST',
      body: JSON.stringify({
        content: audio.toString('base64'),
        recognition_model: {
          model: this.#settings.model,
          audio_format: { container_audio: { container_audio_type: container } },
        },
      }),
      signal,
    });
    const externalId = idOf(payload);

    if (externalId === null) {
      throw this.failure('ответ без идентификатора операции');
    }

    return {
      state: TranscriptionState.Running,
      text: null,
      code: null,
      externalId,
    };
  }

  /**
   * Спрашивает о судьбе операции и, если она кончилась, забирает текст.
   *
   * Сбой самого опроса — **не исход**, а отказ порта: прогон его
   * залогирует и спросит следующим тиком (дизайн, 7.5). Исходом становится
   * только то, что сказал провайдер: ошибка операции — `failed`, готовая
   * операция без текста — `failed` с `transcription_empty`, потому что
   * саммари рождается из текста, и пустого `content` у записи хроники не
   * бывает.
   */
  async poll(externalId: string, signal: AbortSignal): Promise<TranscriptionAnswer> {
    const operation = await this.ask(`${OPERATIONS_BASE_URL}/operations/${externalId}`, { signal });

    if (operation.done !== true) {
      return { state: TranscriptionState.Running, text: null, code: null, externalId };
    }

    if (operation.error !== undefined && operation.error !== null) {
      // Тело чужой ошибки наружу не идёт ни целиком, ни фрагментом: в нём
      // бывает и присланное нами, и подробности о ключе.
      this.logger.warn(`Операция ${externalId} кончилась ошибкой службы`);

      return {
        state: TranscriptionState.Failed,
        text: null,
        code: TRANSCRIBER_UNAVAILABLE,
        externalId,
      };
    }

    const text = transcriptOf(
      await this.read(`${this.base()}/stt/v3/getRecognition?operationId=${externalId}`, signal),
    );

    if (text === '') {
      return {
        state: TranscriptionState.Failed,
        text: null,
        code: TRANSCRIPTION_EMPTY,
        externalId,
      };
    }

    return { state: TranscriptionState.Done, text, code: null, externalId };
  }

  /**
   * Просит службу забыть результаты распознавания.
   *
   * Результаты живут у провайдера 3 суток; убираем сразу, не дожидаясь
   * срока (дизайн, 9.3). **Точный REST-путь не проверен** (пункт 6 таблицы
   * проверок): в proto метод `DeleteRecognition` есть, в справочнике REST
   * страница пустует. Цена ошибки здесь нулевая — отказ не бросается, а
   * результаты истекут сами, и это названная граница, а не дефект.
   */
  async forget(externalId: string): Promise<void> {
    try {
      await this.send(`${this.base()}/stt/v3/deleteRecognition?operationId=${externalId}`, {
        method: 'POST',
      });
    } catch {
      // Best effort: текст уже у нас, и повторять расшифровку из-за
      // неубранных результатов незачем.
      this.logger.warn(`Результаты операции ${externalId} у службы остались`);
    }
  }

  /**
   * Спрашивает узел о несуществующей операции и называет исход.
   *
   * Адрес — **настроенный**, а не узел операций: проверять надо то, что
   * вписал человек, а узел операций один на всё облако и о настройке не
   * сказал бы ничего.
   *
   * `404` — это **успех**: операции с таким идентификатором у провайдера
   * нет никогда, и ответ «не найдено» означает ровно то, что проверка
   * выясняет — до узла дошли, ключ приняли, каталог приняли. Точный код
   * ответа на несуществующую операцию живым вызовом **не проверен**:
   * ответит узел `400` — исход будет `bad_request`, и это не ложь, он
   * действительно не принял наш запрос; ответит `401` или `403` — исход
   * назовёт ключ. Ни один из этих ответов не выдумывается: показывается
   * то, что сказал узел, вместе с его кодом.
   *
   * Тело чужого ответа не читается вовсе: в нём бывает и ключ в строке
   * запроса, и подробности чужой настройки, а исходу довольно кода.
   */
  async probe(signal: AbortSignal): Promise<ModelProbeResult> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await this.send(
        `${this.base()}/stt/v3/getRecognition?operationId=${PROBE_OPERATION_ID}`,
        { signal },
      );
    } catch {
      // Ни текста чужой ошибки, ни причины: исход — это код и время.
      return this.probeResult(ModelProbeOutcome.Unavailable, null, startedAt);
    }

    return this.probeResult(outcomeOfProbe(response.status), response.status, startedAt);
  }

  /** Исход проверки: узел и модель называются, ключ — никогда. */
  private probeResult(
    outcome: ModelProbeOutcome,
    status: number | null,
    startedAt: number,
  ): ModelProbeResult {
    return {
      outcome,
      status,
      host: this.#settings.host,
      model: this.#settings.model,
      durationMs: Date.now() - startedAt,
    };
  }

  /** Тело ответа как объект; любая неудача — один и тот же отказ. */
  private async ask(url: string, init: RequestInit): Promise<OperationResponse> {
    const payload = await this.read(url, init.signal ?? undefined, init);

    try {
      const parsed: unknown = JSON.parse(payload);

      return typeof parsed === 'object' && parsed !== null ? (parsed as OperationResponse) : {};
    } catch {
      throw this.failure('ответ не разобрался');
    }
  }

  /** Тело ответа строкой: у `getRecognition` это поток объектов. */
  private async read(
    url: string,
    signal: AbortSignal | undefined,
    init: RequestInit = {},
  ): Promise<string> {
    let response: Response;

    try {
      response = await this.send(url, { ...init, signal });
    } catch {
      // Ни текст чужой ошибки, ни её причина сюда не попадают: в них
      // бывает и ключ в строке запроса, и присланное нами.
      throw this.failure('узел не ответил');
    }

    if (!response.ok) {
      throw this.failure(`узел ответил ${response.status}`);
    }

    const payload = await response.text();

    if (payload.length > MAX_RESPONSE_CHARS) {
      throw this.failure('ответ длиннее допустимого');
    }

    return payload;
  }

  /** Один запрос: заголовки, предел ожидания и запрет переадресации общие. */
  private send(url: string, init: RequestInit): Promise<Response> {
    const signal = init.signal ?? undefined;

    return fetch(url, {
      ...init,
      headers: this.headersOf(init.body !== undefined),
      // Адрес узла задаёт только настройка, и переадресация его меняет:
      // 307 и 308 сохраняют метод и тело, то есть настроенный узел одним
      // ответом переслал бы запись созвона на любой чужой адрес.
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs())])
        : AbortSignal.timeout(this.timeoutMs()),
    });
  }

  /**
   * Заголовки запроса — и ни одного лишнего.
   *
   * `x-folder-id` у SpeechKit не опционален, поэтому он и делает порт
   * выключенным при пустом каталоге. `Content-Type` ставится только там,
   * где есть тело.
   */
  private headersOf(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    const authorization = this.authorizationOf();

    if (authorization !== null) {
      headers.Authorization = authorization;
    }

    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.#settings.folder !== null) {
      headers['x-folder-id'] = this.#settings.folder;
    }

    return headers;
  }

  /**
   * Значение `Authorization` либо `null`, когда его не ставят.
   *
   * Схема, а не класс адаптера: Yandex отличается от OpenAI одним словом в
   * одном заголовке. Пустой ключ оставляет заголовок ненаписанным — порт в
   * этом состоянии и так выключен, а `Api-Key ` с пустым значением узел
   * вправе отвергнуть, и отказ назвал бы не ту причину.
   */
  private authorizationOf(): string | null {
    if (this.#settings.authScheme === ModelAuthScheme.None || this.#settings.apiKey === '') {
      return null;
    }

    const prefix = this.#settings.authScheme === ModelAuthScheme.ApiKey ? 'Api-Key' : 'Bearer';

    return `${prefix} ${this.#settings.apiKey}`;
  }

  /** Адрес узла без замыкающей косой: иначе в пути окажется двойная. */
  private base(): string {
    return this.#settings.baseUrl.replace(/\/+$/, '');
  }

  /** Предел ожидания одного обмена в миллисекундах. */
  private timeoutMs(): number {
    return this.#settings.timeoutSeconds * 1000;
  }

  /**
   * Отказ «не ответил» с безопасным сообщением.
   *
   * Имя узла в сообщении есть, ключа и чужого тела — нет: человеку нужно
   * знать, кто не ответил, а не что именно он прислал.
   */
  private failure(reason: string): TranscriberFailure {
    return new TranscriberFailure(
      TRANSCRIBER_UNAVAILABLE,
      `Расшифровка не удалась: ${this.#settings.host ?? 'служба'} — ${reason}.`,
    );
  }
}

/**
 * Как служба называет контейнер этой дорожки; `null` — не называет.
 *
 * Отвечает `null`, а не бросает: неизвестный тип до адаптера не доходит
 * (`prepareDecision` его не пропускает), и адаптер не место для
 * исключений из-за опечатки в настройке (дизайн, 7.2).
 */
export function containerTypeOf(audioType: string): string | null {
  return CONTAINER_BY_TYPE[audioType] ?? null;
}

/** Идентификатор операции из ответа; чего-то не хватает — `null`. */
function idOf(payload: OperationResponse): string | null {
  return typeof payload.id === 'string' && payload.id !== '' ? payload.id : null;
}
