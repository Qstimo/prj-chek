import {
  RECORDING_NO_AUDIO_TRACK,
  TRANSCRIBER_UNAVAILABLE,
  TRANSCRIPTION_EMPTY,
  TranscriptionState,
} from '@cairn/shared';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { AuditService } from '../../audit/audit.service';
import { AuditAction, type AuditActor } from '../../audit/audit.types';
import { DATABASE } from '../../db/db.module';
import type { Database } from '../../db/db.types';
import type { TranscriptionJobRow } from '../../db/schema';
import { AUDIO_EXTRACTOR, ExtractionFailure, type AudioExtractor } from './extractor';
import { JobAction, decide } from './job-decision';
import { RecordingStore } from './recording-store';
import { transcriberSettings } from './settings';
import {
  TRANSCRIBER_SOURCE,
  TranscriberFailure,
  type Transcriber,
  type TranscriberSource,
} from './transcriber';
import { TranscriptionRepository } from './transcription.repository';
import { TranscriptionService, actorOf } from './transcription.service';

/** Чем кончился запрос на тик. */
export enum TranscriptionRunOutcome {
  /** Тик состоялся целиком. */
  Done = 'done',
  /** Тик уже идёт — здесь или в другом экземпляре API. */
  Busy = 'busy',
}

/**
 * Токен соединения, на котором держится замок тика.
 *
 * Отдельно от рабочего подключения по той же причине, что у прогона
 * проверок: замок занимает соединение на весь тик, а в тестах рабочий пул
 * состоит из единственного соединения — занять его значило бы запереть сам
 * прогон. В развёртывании это тот же пул, что и `DATABASE`.
 */
export const TRANSCRIPTION_RUN_LOCK_DB = Symbol('TRANSCRIPTION_RUN_LOCK_DB');

/**
 * Ключ замка тика: класс «CAIRN», объект «прогон расшифровок».
 *
 * Тот же класс, что у прогона проверок, объект 2 — у того объект 1. Пара
 * чисел читается глазами и не столкнётся с чужим замком.
 */
const LOCK_CLASS = 0x4341_4952;
const LOCK_OBJECT = 2;

/**
 * Сколько тяжёлых шагов делается за один тик.
 *
 * **Константа в коде, а не переменная окружения**, и у решения две
 * половины:
 *
 * - *почему один*: `ffmpeg` на часовом файле занимает ядро на минуты, а
 *   отправка читает дорожку с диска и кодирует её в `base64` (40 МиБ →
 *   ≈56 МБ в куче). Два таких шага сразу — это либо два занятых ядра, либо
 *   сто мегабайт сверху на машине, где уже живут база, API, веб и прокси.
 *   Переменная приглашала бы поставить десять и получить `OOM`;
 * - *почему общий на извлечение и отправку*: это один и тот же ресурс —
 *   ядро и память машины, — и бюджет, считающий их по отдельности, не
 *   бюджет. Следствие названо: **одна запись покидает машину за два тика**,
 *   то есть на сорок секунд позже, чем могла бы. Против минут
 *   распознавания это ничто (дизайн, 6.2).
 */
export const MAX_HEAVY_PER_TICK = 1;

/**
 * Фоновый прогон расшифровок (дизайн, раздел 6).
 *
 * Устройство повторяет `StatusRunnerService`, и это повторение, а не
 * совпадение: замок лежит **в базе** (`pg_try_advisory_xact_lock`) на
 * **отдельном соединении**, он **уровня транзакции**, а признак идущего
 * тика захватывается **синхронно**, до первого `await`. Причина у каждого
 * приёма своя и названа рядом с ним.
 *
 * Почему замок в базе, а не в памяти: в памяти он не защитил бы от второго
 * экземпляра API за прокси, а два тика одновременно — это две отправки
 * одной записи наружу, то есть двойная оплата и двойное раскрытие. Для
 * статуса ценой гонки было ложное уведомление; здесь она выше.
 *
 * Два отличия от прогона проверок, и оба надо назвать прямо, иначе их
 * прочтут как небрежность:
 *
 * 1. `onModuleDestroy` **не ждёт** `ffmpeg`, а убивает его: тик с
 *    извлечением длится минуты, и держать остановку приложения столько
 *    нельзя. Терять нечего — извлечение бесплатно и ничего не раскрывает,
 *    а следующий подъём начнёт заново, убрав недописанный выход. Ждать
 *    нужно ровно одного — **конца идущей отправки**, чтобы не оставить
 *    `sending` там, где через полсекунды был бы `running`;
 * 2. замок держится всё извлечение, то есть **минуты**, а не секунды. Цена
 *    названа в разделе 6.2 дизайна (долгая транзакция держит `xmin` и
 *    мешает уборке мёртвых строк), и альтернатива — замок только на захват
 *    задачи — там же отвергнута с причиной.
 *
 * Фоновый тик **в журнал действий не пишется**: это не действие субъекта. В
 * журнал пишутся передача и её исход, и их действующее лицо — человек,
 * попросивший расшифровку (дизайн, 6.1 и 6.4).
 */
@Injectable()
export class TranscriptionRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranscriptionRunnerService.name);
  private timer: NodeJS.Timeout | null = null;
  /**
   * Идущий тик, если он есть.
   *
   * Память не заменяет замок базы: она сразу отсеивает повторный запрос в
   * том же процессе, пока первый ещё получает соединение и замок.
   */
  private current: Promise<TranscriptionRunOutcome> | null = null;
  /** Сигнал идущего извлечения: им его и убивают при остановке. */
  private extraction: AbortController | null = null;
  /**
   * Процесс уходит.
   *
   * Отличает «извлечение убито остановкой» от «извлечение не вышло»: в
   * первом случае строка обязана остаться в `extracting`, чтобы следующий
   * подъём начал заново, а закрыть её неудачей значило бы потребовать от
   * человека нажать «снова» после обычного деплоя.
   */
  private isStopping = false;
  private counted = 0;

  constructor(
    @Inject(TRANSCRIPTION_RUN_LOCK_DB) private readonly lockDb: Database,
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TranscriptionRepository,
    private readonly service: TranscriptionService,
    private readonly audit: AuditService,
    private readonly store: RecordingStore,
    // Источник, а не адаптер: настройка узла правится на экране, и порт
    // берётся **один раз на тик** (см. `sweep`).
    @Inject(TRANSCRIBER_SOURCE) private readonly transcribers: TranscriberSource,
    @Inject(AUDIO_EXTRACTOR) private readonly extractor: AudioExtractor,
  ) {}

  /** Сколько тиков было запрошено: по нему виден тик при подъёме. */
  get ticks(): number {
    return this.counted;
  }

  /** Заведён ли цикл: при нулевом интервале его нет вовсе. */
  get hasTimer(): boolean {
    return this.timer !== null;
  }

  /** Нет идущего тика. */
  get isIdle(): boolean {
    return this.current === null;
  }

  onModuleInit(): void {
    const seconds = transcriberSettings().pollSeconds;

    if (seconds <= 0) {
      // `0` — выключатель цикла целиком: так работают тесты и локальная
      // разработка. Тик при этом не идёт и один раз: выключено значит
      // выключено.
      return;
    }

    const start = (): void => {
      // `runAll` уже пишет отказ в лог; фон не оставляет rejected Promise.
      void this.runAll().catch(() => undefined);
    };

    // Первый тик идёт сразу, а не через интервал: иначе загруженная запись
    // стояла бы в очереди лишние двадцать секунд после каждого деплоя.
    start();

    this.timer = setInterval(start, seconds * 1000);
    // Процесс не должен жить ради таймера.
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.isStopping = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Сначала убить `ffmpeg`, потом ждать: ждать его конца значило бы
    // держать остановку приложения минутами.
    this.extraction?.abort();

    await this.settled();
  }

  /**
   * Прогоняет тик и ждёт его конца.
   *
   * Отдаёт {@link TranscriptionRunOutcome.Busy}, если тик уже идёт — здесь
   * или в другом экземпляре API.
   */
  async runAll(): Promise<TranscriptionRunOutcome> {
    if (this.current) {
      return TranscriptionRunOutcome.Busy;
    }

    return this.claim();
  }

  /** Ждёт конца идущего тика; без тика — возвращается сразу. */
  async settled(): Promise<void> {
    // Отказ тика уже в логе: остановка приложения не должна падать из-за
    // него.
    await this.current?.catch(() => undefined);
  }

  /**
   * Занимает признак тика синхронно и отпускает его в конце.
   *
   * Синхронно — обязательное условие: признак, выставленный после первого
   * `await`, два одновременных запроса обошли бы оба.
   */
  private claim(): Promise<TranscriptionRunOutcome> {
    this.counted += 1;

    const running = this.locked().finally(() => {
      this.current = null;
    });

    this.current = running;

    return running;
  }

  /**
   * Берёт замок тика и под ним делает работу.
   *
   * Транзакция здесь — держатель замка, а не единица записи: сеансовый
   * `pg_try_advisory_lock` принадлежит соединению, а соединение из пула нам
   * не принадлежит — снимать замок пришлось бы на чужом. Замок уровня
   * транзакции снимается её концом, чем бы тик ни кончился: исключением,
   * падением процесса, обрывом связи. Записи тика идут своими соединениями
   * и этой транзакции не касаются.
   */
  private async locked(): Promise<TranscriptionRunOutcome> {
    return this.lockDb.transaction(async (tx) => {
      const rows = (await tx.execute(
        sql`select pg_try_advisory_xact_lock(${LOCK_CLASS}, ${LOCK_OBJECT}) as locked`,
      )) as unknown as { locked: boolean }[];

      if (rows[0]?.locked !== true) {
        this.logger.log('Прогон расшифровок уже идёт: этот пропущен.');

        return TranscriptionRunOutcome.Busy;
      }

      await this.sweep();

      return TranscriptionRunOutcome.Done;
    });
  }

  /**
   * Один тик: сначала опрос всех идущих, потом один тяжёлый шаг.
   *
   * **Порядок имеет цену, и она названа**: опрос дёшев (миллисекунды),
   * извлечение — минуты. Опрашивай после извлечения, и текст, готовый у
   * провайдера пять минут назад, лежал бы ещё столько, сколько длится чужой
   * `ffmpeg`. Одна строка порядка — и расшифровки больше не ждут за
   * перекодированием.
   *
   * Опрос числом не ограничен: он тела не несёт и наружу ничего не
   * раскрывает сверх уже отправленного, а квота провайдера при одном тике
   * в двадцать секунд не достигается никогда.
   *
   * Падение одной задачи не прерывает тик — ровно как обход адресов не
   * прерывается падением одного адреса.
   */
  private async sweep(): Promise<void> {
    const jobs = await this.repository.pending(this.db);
    const settings = transcriberSettings();
    // Порт — один на тик, а не на шаг. Решение о задаче спрашивает у него
    // «включено ли», а отправка — куда и чем: увидь они разные настройки,
    // задача, пропущенная решением как включённая, уехала бы на узел,
    // которого в настройке уже нет. Цена — один `SELECT` по первичному
    // ключу на тик.
    const transcriber = await this.transcribers.current();
    const now = new Date();

    for (const job of jobs) {
      // Решение считается с нулевым бюджетом: так из него выходит только
      // то, что бюджета не требует, — опрос.
      if (this.decisionOf(job, now, settings, 0, transcriber).action !== JobAction.Poll) {
        continue;
      }

      await this.guarded(job, () => this.poll(job, transcriber));
    }

    let heavyLeft = MAX_HEAVY_PER_TICK;

    for (const job of jobs) {
      const decision = this.decisionOf(job, now, settings, heavyLeft, transcriber);

      // Закрытие неудачей бюджета не занимает: оно не стоит ни ядра, ни
      // памяти, и держать его до следующего тика незачем.
      if (decision.action === JobAction.Fail) {
        await this.guarded(job, () => this.service.fail(job, decision.code!));
        continue;
      }

      if (decision.action === JobAction.Extract) {
        heavyLeft -= 1;
        await this.guarded(job, () => this.extract(job));
        continue;
      }

      if (decision.action === JobAction.Send) {
        heavyLeft -= 1;
        await this.guarded(job, () => this.send(job, transcriber));
      }
    }
  }

  /** Решение о задаче: чистая функция, время и бюджет — параметрами. */
  private decisionOf(
    job: TranscriptionJobRow,
    now: Date,
    settings: ReturnType<typeof transcriberSettings>,
    heavyLeft: number,
    transcriber: Transcriber,
  ): ReturnType<typeof decide> {
    return decide({
      state: job.state,
      transcriber: job.transcriber,
      uploadPath: job.uploadPath,
      audioPath: job.audioPath,
      startedAt: job.startedAt,
      sentAt: job.sentAt,
      now,
      heavyLeft,
      maxMinutes: settings.maxMinutes,
      isEnabled: transcriber.isEnabled,
    });
  }

  /**
   * Спрашивает службу о судьбе работы.
   *
   * **Сбой опроса — не исход.** Таймаут или `5xx` у `GET /operations`
   * ничего не говорит о судьбе работы: провайдер считает дальше. Такой сбой
   * уходит в лог и повторяется следующим тиком, пока не истечёт предел
   * ожидания. Это отличие от отказа передачи, где повтор означал бы вторую
   * передачу и вторую оплату: опрос бесплатен и ничего не раскрывает.
   */
  private async poll(job: TranscriptionJobRow, transcriber: Transcriber): Promise<void> {
    if (!job.externalId) {
      // Строка `running` без идентификатора операции — строка, которую
      // нечем опросить; переход в `running` её и не допускает.
      await this.service.fail(job, TRANSCRIBER_UNAVAILABLE);

      return;
    }

    const controller = new AbortController();

    try {
      const answer = await transcriber.poll(job.externalId, controller.signal);

      await this.apply(job, answer, transcriber);
    } finally {
      // Сигнал принадлежит прогону: обрыв в `finally` не даёт запросу
      // пережить вызов.
      controller.abort();
    }
  }

  /**
   * Приводит запись к пригодному виду: `ffprobe`, затем `ffmpeg`.
   *
   * Три решения, и каждое — своё:
   *
   * 1. **`extracting` ставится прежде запуска процесса**, своей короткой
   *    транзакцией. Это не журналирование (наружу ничего не уходит), а
   *    **захват работы**: без него два тика двух экземпляров API запустили
   *    бы два `ffmpeg` на один файл и писали бы в один и тот же выходной
   *    путь;
   * 2. **недописанный выход убирается до запуска**: `ffmpeg` писал в тот же
   *    путь, и остаток прошлой попытки иначе был бы принят за готовую
   *    дорожку;
   * 3. **отсутствие дорожки — отдельный код.** Его знает только `ffprobe`,
   *    и человек по нему делает другое: выгружает созвон заново со звуком,
   *    а не нажимает «снова» (дизайн, 7.5).
   */
  private async extract(job: TranscriptionJobRow): Promise<void> {
    // Решение `Extract` принимается при пустой дорожке, а пустая дорожка
    // вместе с пустым исходником даёт `Fail`: сюда можно попасть только с
    // живым исходником.
    const uploadPath = job.uploadPath!;
    const controller = new AbortController();

    this.extraction = controller;

    try {
      await this.db.transaction((tx) => this.repository.markExtracting(tx, job.id));

      const probe = await this.extractor.probe(uploadPath, controller.signal);

      if (!probe.hasAudio) {
        await this.service.fail(job, RECORDING_NO_AUDIO_TRACK);

        return;
      }

      await this.store.remove(this.store.audioNameOf(job.id));

      const audio = await this.extractor.extract(uploadPath, job.id, controller.signal);
      const returned = await this.db.transaction((tx) =>
        this.repository.markExtracted(tx, job.id, audio),
      );

      if (!returned) {
        // Задачу закрыли, пока шло извлечение: дорожку никто не прочтёт, а
        // место она занимает.
        await this.store.removeAll([audio.path]);
      }
    } catch (cause) {
      if (this.isStopping) {
        // Строка остаётся в `extracting`: следующий подъём начнёт заново.
        // Закрывать её неудачей значило бы требовать нажатия «снова»
        // после обычного деплоя.
        this.logger.log(`Извлечение ${job.id} прервано остановкой: повторится при подъёме`);

        return;
      }

      await this.service.fail(job, extractionCodeOf(cause));
      // Единственное, что уносит отказ извлечения, — недописанный выход.
      // Загруженный файл остаётся: отказ не повод терять то, что человек
      // загрузил по медленному каналу.
      await this.store.removeAll([this.store.audioNameOf(job.id)]);
    } finally {
      this.extraction = null;
      controller.abort();
    }
  }

  /**
   * Отдаёт дорожку службе.
   *
   * Порядок обязателен: **журнал → сеть**. Запись о передаче идёт прежде
   * первого байта, своей короткой транзакцией вместе с переходом в
   * `sending`: нет записи — нет и передачи. Запись после успеха потерялась
   * бы при падении процесса, и получился бы самый плохой случай — запись
   * созвона ушла наружу, а следа нет (дизайн, 9.1).
   *
   * Сам вызов идёт **вне транзакции**: держать её открытой, пока отвечает
   * чужой узел, нельзя — это занятое соединение из пула и замок на строке.
   */
  private async send(job: TranscriptionJobRow, transcriber: Transcriber): Promise<void> {
    const controller = new AbortController();
    const startedAt = Date.now();
    const actor = await this.actorFor(job);

    try {
      await this.db.transaction(async (tx) => {
        await this.repository.markSending(tx, job.id, { host: transcriber.host });

        if (actor) {
          await this.audit.record(tx, actor, {
            action: AuditAction.SummaryTranscriptionRequested,
            entityType: 'transcription_job',
            entityId: job.id,
            projectId: job.projectId,
            metadata: {
              transcriber: transcriber.kind,
              host: transcriber.host,
              model: transcriber.model,
              // Наружу уходит дорожка: на вопрос «что покинуло машину»
              // отвечает только эта пара.
              audioBytes: job.audioBytes,
              audioType: job.audioType,
              // А на вопрос «из чего это сделано» — только эта, и её
              // задают при разборе качества распознавания.
              uploadBytes: job.uploadBytes,
              uploadType: job.uploadType,
              extracted: job.audioPath !== job.uploadPath,
              // Заголовок `x-data-logging-enabled` не отправляется
              // никогда, и запись говорит об этом прямо.
              dataLogging: false,
            },
          });
        }
      });

      const answer = await transcriber.start(
        {
          audioPath: job.audioPath!,
          audioType: job.audioType ?? 'audio/ogg',
        },
        controller.signal,
      );

      await this.apply(job, answer, transcriber);
    } catch (cause) {
      await this.service.fail(job, transcriberCodeOf(cause), Date.now() - startedAt);
    } finally {
      controller.abort();
    }
  }

  /**
   * Применяет ответ службы к задаче.
   *
   * Один разбор на передачу и на опрос, потому что ответ у них один: порт
   * отвечает состоянием службы, а не тем, каким вопросом его спросили.
   * Синхронная служба (локальный `faster-whisper`) отвечает `done` сразу, и
   * текст укладывается тем же тиком — под это порт и расширен.
   */
  private async apply(
    job: TranscriptionJobRow,
    answer: Awaited<ReturnType<Transcriber['poll']>>,
    transcriber: Transcriber,
  ): Promise<void> {
    if (answer.state === TranscriptionState.Done) {
      const text = (answer.text ?? '').trim();

      if (text === '') {
        // Пустота успехом быть не может: саммари рождается из текста, а
        // пустого текста у записи хроники не бывает. Файл остаётся —
        // человек слушает запись сам и решает, была ли там речь.
        await this.service.fail(job, TRANSCRIPTION_EMPTY);

        return;
      }

      await this.service.settle(job, answer.text!);
      await this.forget(job, answer.externalId ?? job.externalId, transcriber);

      return;
    }

    if (answer.state === TranscriptionState.Failed) {
      await this.service.fail(job, answer.code ?? TRANSCRIBER_UNAVAILABLE);

      return;
    }

    if (job.state === TranscriptionState.Running) {
      // Провайдер ещё считает: следующий тик спросит снова.
      return;
    }

    if (!answer.externalId) {
      // Опрашивать нечего, и строка обязана остаться `sending`: следующий
      // подъём закроет её как прерванную передачу — исход действительно
      // неизвестен (дизайн, 2.3).
      this.logger.warn(`Расшифровка ${job.id}: служба не назвала операцию`);

      return;
    }

    await this.db.transaction((tx) =>
      this.repository.markRunning(tx, job.id, answer.externalId!),
    );
  }

  /**
   * Просит службу забыть результаты — best effort.
   *
   * Результаты распознавания живут у провайдера три суток: это его
   * политика, обойти её нельзя, но можно попросить убрать сразу. Отказ
   * исхода не меняет: текст уже у нас, повторять расшифровку из-за
   * неубранных результатов незачем, а через три суток они истекут сами.
   */
  private async forget(
    job: TranscriptionJobRow,
    externalId: string | null,
    transcriber: Transcriber,
  ): Promise<void> {
    if (!externalId) {
      return;
    }

    try {
      await transcriber.forget(externalId);
    } catch (cause) {
      this.logger.warn(`Служба не забыла результаты ${externalId}: ${String(cause)}`);
    }
  }

  /** Действующее лицо журнала по задаче; `null` — субъекта не стало. */
  private async actorFor(job: TranscriptionJobRow): Promise<AuditActor | null> {
    const subject = await this.repository.requesterOf(job.requestedBySubjectId, this.db);

    return subject ? actorOf(subject) : null;
  }

  /** Шаг задачи, падение которого не прерывает тик. */
  private async guarded(job: TranscriptionJobRow, step: () => Promise<void>): Promise<void> {
    try {
      await step();
    } catch (cause) {
      this.logger.warn(`Расшифровка ${job.id} в этом тике не продвинулась: ${String(cause)}`);
    }
  }
}

/** Код отказа извлечения либо общее «не вышло». */
function extractionCodeOf(cause: unknown): string {
  return cause instanceof ExtractionFailure ? cause.code : 'extraction_failed';
}

/**
 * Код отказа службы либо общее «не ответила».
 *
 * Чужое исключение без кода — тоже «не ответила»: его текст в журнал не
 * попадает, а различать нечем.
 */
function transcriberCodeOf(cause: unknown): string {
  return cause instanceof TranscriberFailure ? cause.code : TRANSCRIBER_UNAVAILABLE;
}
