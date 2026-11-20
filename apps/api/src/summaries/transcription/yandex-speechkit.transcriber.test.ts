import {
  DEFAULT_MAX_SEND_BYTES,
  ModelAuthScheme,
  ModelProbeOutcome,
  RECORDING_TYPE_NOT_ACCEPTED,
  TRANSCRIBER_DISABLED,
  TRANSCRIBER_UNAVAILABLE,
  TRANSCRIPTION_EMPTY,
  TranscriberKind,
  TranscriptionState,
} from '@cairn/shared';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { DisabledTranscriber } from './disabled.transcriber';
import { RecordingStore } from './recording-store';
import type { TranscriberSettings } from './settings';
import { TranscriberFailure, type TranscriptionInput } from './transcriber';
import {
  OPERATIONS_BASE_URL,
  PROBE_OPERATION_ID,
  YandexSpeechKitTranscriber,
  containerTypeOf,
} from './yandex-speechkit.transcriber';

/** Байты дорожки: настоящего медиафайла ни один тест не читает. */
const BYTES = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);

/** Что отдаётся на расшифровку: только дорожка, и ничего больше. */
const INPUT: TranscriptionInput = { audioPath: 'запись.opus', audioType: 'audio/ogg' };

/** Настройки боевого вида: точечные проверки меняют одно поле. */
const SETTINGS: TranscriberSettings = {
  kind: TranscriberKind.External,
  baseUrl: 'https://stt.api.cloud.yandex.net',
  apiKey: 'ключ',
  authScheme: ModelAuthScheme.ApiKey,
  model: 'general',
  folder: 'каталог',
  timeoutSeconds: 180,
  maxSendBytes: DEFAULT_MAX_SEND_BYTES,
  maxUploadBytes: 2_147_483_648,
  pollSeconds: 20,
  maxMinutes: 120,
  ffmpeg: 'auto',
  audioBitrate: '24k',
  extractMinutes: 30,
  host: 'stt.api.cloud.yandex.net',
  isOff: false,
  isEnabled: true,
};

/** Событие ответа `getRecognition` с нормализованным текстом. */
function refinement(text: string): string {
  return JSON.stringify({ final_refinement: { normalized_text: { alternatives: [{ text }] } } });
}

/** Ответ с телом JSON. */
function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

/** Ответ с телом-потоком объектов: так отвечает `getRecognition`. */
function text(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('адаптер Yandex SpeechKit', () => {
  let store: RecordingStore;
  let fetchMock: Mock;
  let transcriber: YandexSpeechKitTranscriber;

  beforeEach(() => {
    store = new RecordingStore();
    vi.spyOn(store, 'read').mockResolvedValue(BYTES);

    fetchMock = vi.fn().mockResolvedValue(json({ id: 'операция-1' }));
    vi.stubGlobal('fetch', fetchMock);

    transcriber = new YandexSpeechKitTranscriber(SETTINGS, store);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Тело первого запроса, разобранное обратно. */
  function body(): Record<string, unknown> {
    const init = fetchMock.mock.calls[0]![1] as RequestInit;

    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  /** Заголовки первого запроса. */
  function headers(): Record<string, string> {
    const init = fetchMock.mock.calls[0]![1] as RequestInit;

    return (init.headers ?? {}) as Record<string, string>;
  }

  it('отправляет дорожку в теле запроса, а не ссылкой на бакет', async () => {
    // Главная находка проверки документации: v3 принимает content
    // байтами до 60 МБ, и бакет не нужен — значит у записи не появляется
    // второй долговременной копии вне нашей машины (дизайн, 3.1).
    await transcriber.start(INPUT, AbortSignal.timeout(1000));

    expect(body().content).toBe(BYTES.toString('base64'));
    expect(body().uri).toBeUndefined();
  });

  it('называет контейнер по типу дорожки', async () => {
    // После появления извлечения обычным случаем стал OGG_OPUS, а WAV и
    // MP3 приходят только с файлов, прошедших мимо извлечения.
    await transcriber.start(INPUT, AbortSignal.timeout(1000));

    const model = body().recognition_model as {
      audio_format: { container_audio: { container_audio_type: string } };
    };

    expect(model.audio_format.container_audio.container_audio_type).toBe('OGG_OPUS');
  });

  it.each([
    ['audio/ogg', 'OGG_OPUS'],
    ['audio/mpeg', 'MP3'],
    ['audio/wav', 'WAV'],
  ])('%s служба называет %s', (audioType, container) => {
    expect(containerTypeOf(audioType)).toBe(container);
  });

  it('незнакомый тип не бросает, а отвечает пустотой', () => {
    // Адаптер не место для исключений из-за опечатки в настройке: до него
    // такой тип не доходит, а отвечать аварией на невозможное незачем.
    expect(containerTypeOf('video/mp4')).toBeNull();
  });

  it('дорожку, которую служба не назовёт, наружу не отправляет', async () => {
    await expect(
      transcriber.start({ audioPath: 'з.mp4', audioType: 'video/mp4' }, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: RECORDING_TYPE_NOT_ACCEPTED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('загруженного файла порт расшифровки не видит вовсе', () => {
    // Он работает только с тем, что уже пригодно службе: видеофайл ему
    // нечем даже назвать.
    expect(Object.keys(INPUT)).toEqual(['audioPath', 'audioType']);
  });

  it('не отправляет наружу ничего, кроме дорожки и опций модели', async () => {
    // Тело сравнивается целиком, как в первой итерации сравнивается
    // тело запроса к предложителю: ни одного кадра видео, ни имени
    // проекта, ни окружений, ни адресов, ни переменных, ни имени
    // субъекта.
    await transcriber.start(INPUT, AbortSignal.timeout(1000));

    expect(Object.keys(body())).toEqual(['content', 'recognition_model']);
    expect(Object.keys(body().recognition_model as object)).toEqual(['model', 'audio_format']);
  });

  it('неподтверждённых опций распознавания не шлёт', async () => {
    // Их написание не проверено живым вызовом (пункт 3 таблицы
    // проверок), а негодный параметр дал бы 400 на каждом вызове.
    await transcriber.start(INPUT, AbortSignal.timeout(1000));

    const model = body().recognition_model as Record<string, unknown>;

    expect(model.text_normalization).toBeUndefined();
    expect(model.language_restriction).toBeUndefined();
    expect(model.audio_processing_type).toBeUndefined();
    expect(model.speaker_labeling).toBeUndefined();
  });

  it('не отправляет заголовок логирования данных никогда', async () => {
    // Аудио у провайдера по умолчанию не сохраняется; логирование
    // включается этим заголовком, и он не наш.
    await transcriber.start(INPUT, AbortSignal.timeout(1000));

    expect(headers()['x-data-logging-enabled']).toBeUndefined();
    expect(Object.keys(headers()).sort()).toEqual([
      'Authorization',
      'Content-Type',
      'x-folder-id',
    ]);
  });

  it('предъявляет ключ словом Api-Key, а не Bearer', async () => {
    await transcriber.start(INPUT, AbortSignal.timeout(1000));

    expect(headers().Authorization).toBe('Api-Key ключ');
  });

  it('отдаёт running и идентификатор операции', async () => {
    fetchMock.mockResolvedValue(json({ id: 'операция-1' }));

    const answer = await transcriber.start(INPUT, AbortSignal.timeout(1000));

    expect(answer).toEqual({
      state: TranscriptionState.Running,
      externalId: 'операция-1',
      text: null,
      code: null,
    });
  });

  it('ответ без идентификатора — отказ, а не running без ключа опроса', async () => {
    fetchMock.mockResolvedValue(json({}));

    await expect(transcriber.start(INPUT, AbortSignal.timeout(1000))).rejects.toThrow(
      TranscriberFailure,
    );
  });

  it('опрос идёт на ручку операций, а не на ручку распознавания', async () => {
    fetchMock.mockResolvedValue(json({ done: false }));

    await transcriber.poll('операция-1', AbortSignal.timeout(1000));

    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${OPERATIONS_BASE_URL}/operations/операция-1`);
  });

  it('опрос незакончённой операции отдаёт running', async () => {
    fetchMock.mockResolvedValue(json({ done: false }));

    expect((await transcriber.poll('операция-1', AbortSignal.timeout(1000))).state).toBe(
      TranscriptionState.Running,
    );
  });

  it('операция с ошибкой отдаёт failed без чужого тела наружу', async () => {
    // В теле чужого ответа бывает и присланное нами, и подробности о
    // ключе: наружу идёт только код.
    fetchMock.mockResolvedValue(json({ done: true, error: { message: 'ключ ... ' } }));

    const answer = await transcriber.poll('операция-1', AbortSignal.timeout(1000));

    expect(answer).toEqual({
      state: TranscriptionState.Failed,
      code: TRANSCRIBER_UNAVAILABLE,
      text: null,
      externalId: 'операция-1',
    });
  });

  it('законченная операция забирает текст вторым запросом', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ done: true }))
      .mockResolvedValueOnce(text(refinement('Обсудили сроки.')));

    const answer = await transcriber.poll('операция-1', AbortSignal.timeout(1000));

    expect(answer.state).toBe(TranscriptionState.Done);
    expect(answer.text).toBe('Обсудили сроки.');
    expect(String(fetchMock.mock.calls[1]![0])).toContain('getRecognition');
  });

  it('законченная операция без текста — названная неудача', async () => {
    // Тишина в записи успехом быть не может: саммари рождается из
    // текста, а пустого content у записи хроники не бывает.
    fetchMock.mockResolvedValueOnce(json({ done: true })).mockResolvedValueOnce(text(''));

    expect((await transcriber.poll('операция-1', AbortSignal.timeout(1000))).code).toBe(
      TRANSCRIPTION_EMPTY,
    );
  });

  it('таймаут и 5xx дают отказ с кодом, а не исключение провайдера', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT /stt/v3?key=...'));

    await expect(transcriber.start(INPUT, AbortSignal.timeout(1000))).rejects.toMatchObject({
      code: TRANSCRIBER_UNAVAILABLE,
    });
  });

  it('чужого текста ошибки в отказе нет, и cause тоже', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT /stt/v3?key=секрет'));

    const failure = (await transcriber
      .start(INPUT, AbortSignal.timeout(1000))
      .then(() => null)
      .catch((error: unknown) => error)) as TranscriberFailure;

    expect(failure.message).not.toContain('секрет');
    expect(failure.cause).toBeUndefined();
  });

  it('повторов не делает', async () => {
    // Один вызов — одна плата; повтор это нажатие человека.
    fetchMock.mockRejectedValue(new Error('сеть'));

    await expect(transcriber.start(INPUT, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('за переадресацией не ходит: адрес узла задаёт настройка', async () => {
    await transcriber.start(INPUT, AbortSignal.timeout(1000));

    expect((fetchMock.mock.calls[0]![1] as RequestInit).redirect).toBe('error');
  });

  it('просит службу забыть результаты после укладки текста', async () => {
    // Результаты живут у провайдера 3 суток: убираем сразу, не
    // дожидаясь срока.
    await transcriber.forget('операция-1');

    expect(String(fetchMock.mock.calls[0]![0])).toContain('deleteRecognition');
  });

  it('отказ forget не бросает: он best effort', async () => {
    // Текст уже у нас; повторять расшифровку из-за неубранных
    // результатов незачем, а через три суток они истекут сами.
    fetchMock.mockRejectedValue(new Error('404'));

    await expect(transcriber.forget('операция-1')).resolves.toBeUndefined();
  });

  describe('проверка связи', () => {
    /** Адрес, по которому ушла проверка. */
    function probedUrl(): string {
      return String(fetchMock.mock.calls[0]![0]);
    }

    it('спрашивает о несуществующей операции и не отправляет ни байта записи', async () => {
      // Главное свойство этой проверки: она **бесплатна**. Живая
      // расшифровка стоит денег у провайдера, и кнопка «Проверить связь»,
      // которая их тратит, нажималась бы один раз в жизни.
      fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

      await transcriber.probe(AbortSignal.timeout(1000));

      expect(probedUrl()).toContain(PROBE_OPERATION_ID);
      expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty('body');
      expect(store.read).not.toHaveBeenCalled();
    });

    it('спрашивает настроенный узел, а не узел операций', async () => {
      // Проверять надо тот адрес, который вписал человек: узел операций
      // один на всё облако, и его ответ ничего не сказал бы о настройке.
      fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

      await transcriber.probe(AbortSignal.timeout(1000));

      expect(probedUrl().startsWith(SETTINGS.baseUrl)).toBe(true);
      expect(probedUrl().startsWith(OPERATIONS_BASE_URL)).toBe(false);
    });

    it('«операции нет» — это успех: ключ и каталог приняты', async () => {
      // Операции с таким идентификатором у провайдера нет никогда, и
      // `404` на неё означает ровно то, что проверка и выясняет: до узла
      // дошли, ключ приняли, каталог приняли.
      fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

      const result = await transcriber.probe(AbortSignal.timeout(1000));

      expect(result.outcome).toBe(ModelProbeOutcome.Ok);
      expect(result.status).toBe(404);
      expect(result.host).toBe('stt.api.cloud.yandex.net');
      expect(result.model).toBe('general');
    });

    it('негодный ключ отличается от негодного адреса', async () => {
      fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));

      expect((await transcriber.probe(AbortSignal.timeout(1000))).outcome).toBe(
        ModelProbeOutcome.Unauthorized,
      );
    });

    it('молчание узла — исход проверки, а не исключение', async () => {
      // Ручка администрирования отвечает `200` с исходом: она справилась,
      // когда выяснила, что чужой узел не отвечает.
      fetchMock.mockRejectedValue(new Error('сеть'));

      const result = await transcriber.probe(AbortSignal.timeout(1000));

      expect(result.outcome).toBe(ModelProbeOutcome.Unavailable);
      expect(result.status).toBeNull();
    });

    it('тела чужого ответа в исходе нет', async () => {
      fetchMock.mockResolvedValue(new Response('ключ sk-утечка негоден', { status: 403 }));

      const result = await transcriber.probe(AbortSignal.timeout(1000));

      expect(JSON.stringify(result)).not.toContain('sk-утечка');
    });
  });

  it('называет узел, модель, предел и принимаемое службой', () => {
    expect(transcriber.host).toBe('stt.api.cloud.yandex.net');
    expect(transcriber.model).toBe('general');
    expect(transcriber.kind).toBe(TranscriberKind.External);
    expect(transcriber.maxSendBytes).toBe(DEFAULT_MAX_SEND_BYTES);
    expect(transcriber.serviceTypes).toEqual(['audio/mpeg', 'audio/ogg', 'audio/wav']);
    expect(transcriber.isEnabled).toBe(true);
  });

  it('ключа не отдаёт даже сериализацией', () => {
    // `private` в TypeScript — проверка компилятора, и только: в готовом
    // объекте поле осталось бы обычным, и ключ уехал бы наружу первым же
    // JSON.stringify порта.
    expect(JSON.stringify(transcriber)).not.toContain('ключ');
    expect(Object.keys(transcriber)).not.toContain('settings');
  });
});

describe('выключенный порт', () => {
  const disabled = new DisabledTranscriber();
  const signal = AbortSignal.timeout(1000);

  it('отвечает выключенным и отказывает названным кодом', async () => {
    expect(disabled.isEnabled).toBe(false);

    await expect(
      disabled.start({ audioPath: 'з.opus', audioType: 'audio/ogg' }, signal),
    ).rejects.toMatchObject({ code: TRANSCRIBER_DISABLED });
    await expect(disabled.poll('операция-1', signal)).rejects.toMatchObject({
      code: TRANSCRIBER_DISABLED,
    });
  });

  it('узла не называет: врать подписью над кнопкой нельзя', () => {
    expect(disabled.host).toBeNull();
  });

  it('проверять связь выключенному нечем, и он отказывает', async () => {
    // Отказ, а не исход `unavailable`: «узел не ответил» сказало бы, что
    // мы спрашивали, — а мы не спрашивали и не вправе спрашивать.
    await expect(disabled.probe(signal)).rejects.toMatchObject({
      code: TRANSCRIBER_DISABLED,
    });
  });

  it('забыть у службы нечего, и это не отказ', async () => {
    // `forget` зовётся по следам успешной расшифровки; у выключенного
    // порта таких следов нет, и ронять уборку незачем.
    await expect(disabled.forget('операция-1')).resolves.toBeUndefined();
  });

  it('в сеть не ходит ни при каких условиях', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await disabled.start({ audioPath: 'з.opus', audioType: 'audio/ogg' }, signal).catch(
      () => undefined,
    );
    await disabled.forget('операция-1');

    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
