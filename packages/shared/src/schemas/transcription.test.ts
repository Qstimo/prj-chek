import { describe, expect, it } from 'vitest';

import { TranscriberKind, TranscriptionState } from '../enums';
import {
  DEFAULT_MAX_SEND_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES,
  EXTRACTION_FAILED,
  EXTRACTION_TIMED_OUT,
  RECORDING_BROKEN,
  RECORDING_CODEC_UNSUPPORTED,
  RECORDING_NEEDS_FFMPEG,
  RECORDING_NO_AUDIO_TRACK,
  RECORDING_TOO_LARGE,
  SERVICE_AUDIO_TYPES,
  TRANSCRIPTION_TOO_LARGE,
  UPLOAD_TYPES,
  transcriberInfoSchema,
  transcriptionJobSchema,
  transcriptionRequestSchema,
} from './transcription';

const ID = '00000000-0000-0000-0000-000000000001';

/** Задача первой расшифровки: саммари ещё нет, паспорт введён человеком. */
const JOB = {
  id: ID,
  projectId: ID,
  projectName: 'CAIRN',
  summaryId: null,
  occurredOn: '2026-11-17',
  title: 'Созвон по релизу',
  state: TranscriptionState.Running,
  transcriber: TranscriberKind.External,
  model: 'general',
  host: 'stt.api.cloud.yandex.net',
  uploadBytes: 566_231_040,
  uploadType: 'video/mp4',
  audioBytes: 11_534_336,
  audioType: 'audio/ogg',
  hasRecording: true,
  failureCode: null,
  startedAt: '2026-11-17T10:00:00.000Z',
  sentAt: '2026-11-17T10:04:12.000Z',
  finishedAt: null,
};

describe('задача расшифровки', () => {
  it('до рождения саммари несёт паспорт и не несёт ссылки', () => {
    const parsed = transcriptionJobSchema.parse(JOB);

    expect(parsed.summaryId).toBeNull();
    expect(parsed.title).toBe('Созвон по релизу');
  });

  it('у повторной расшифровки есть саммари и нет паспорта', () => {
    // Паспорт саммари — паспорт его записи хроники; второй копии нет.
    const parsed = transcriptionJobSchema.parse({
      ...JOB,
      summaryId: ID,
      occurredOn: null,
      title: null,
    });

    expect(parsed.summaryId).toBe(ID);
    expect(parsed.occurredOn).toBeNull();
  });

  it('помнит, покинула ли запись машину', () => {
    // `sentAt` отдельно от `startedAt`: между ними лежит и очередь, и
    // извлечение, и на вопрос «когда созвон ушёл наружу» отвечает
    // только второе.
    expect(transcriptionJobSchema.parse({ ...JOB, sentAt: null }).sentAt).toBeNull();
  });

  it('помнит, есть ли ещё запись на томе', () => {
    expect(transcriptionJobSchema.parse({ ...JOB, hasRecording: false }).hasRecording).toBe(false);
  });

  it('до извлечения дорожки нет, а загруженное известно', () => {
    // Два разных числа и два разных вопроса: «что загрузили» и «что
    // уйдёт наружу». Одной тройкой колонок это не выражается.
    const parsed = transcriptionJobSchema.parse({
      ...JOB,
      state: TranscriptionState.Extracting,
      audioBytes: null,
      audioType: null,
      sentAt: null,
    });

    expect(parsed.audioBytes).toBeNull();
    expect(parsed.uploadBytes).toBe(566_231_040);
  });

  it('извлечение могло не понадобиться: загруженное и есть дорожка', () => {
    const parsed = transcriptionJobSchema.parse({
      ...JOB,
      uploadType: 'audio/mpeg',
      uploadBytes: 10_000_000,
      audioType: 'audio/mpeg',
      audioBytes: 10_000_000,
    });

    expect(parsed.audioType).toBe(parsed.uploadType);
  });

  it('текста расшифровки в задаче нет', () => {
    // Текст не задерживается ни на шаг: из порта в память, оттуда в
    // `chronicle_entries.content`. Схема выдачи его не несёт, и лишнее
    // поле до интерфейса не доезжает.
    const parsed = transcriptionJobSchema.parse({ ...JOB, text: 'расшифровка' });

    expect('text' in parsed).toBe(false);
  });
});

describe('два списка форматов', () => {
  it('служба принимает три контейнера, по документации', () => {
    expect([...SERVICE_AUDIO_TYPES]).toEqual(['audio/mpeg', 'audio/ogg', 'audio/wav']);
  });

  it('загрузка принимает шире, и это ровно то, что закрывает извлечение', () => {
    // Разница между списками и есть смысл ffmpeg в образе.
    expect(UPLOAD_TYPES.length).toBeGreaterThan(SERVICE_AUDIO_TYPES.length);
    for (const type of SERVICE_AUDIO_TYPES) {
      expect(UPLOAD_TYPES).toContain(type);
    }
  });

  it('загрузка принимает mp4 — настоящий формат записей владельца', () => {
    // Решение «только аудио» снято потому, что записи приходят mp4,
    // а mp4 служба не принимает (дизайн, блок правки).
    expect(UPLOAD_TYPES).toContain('video/mp4');
    expect(SERVICE_AUDIO_TYPES).not.toContain('video/mp4');
  });

  it('загрузка принимает m4a, который служба тоже не берёт', () => {
    expect(UPLOAD_TYPES).toContain('audio/mp4');
  });
});

describe('паспорт загружаемой записи', () => {
  it('принимает дату, заголовок и тип', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: '2026-11-17',
        title: 'Созвон',
        uploadType: 'video/mp4',
      }),
    ).not.toThrow();
  });

  it('принимает весь широкий список, а не только то, что умеет установка', () => {
    // Доступность ffmpeg — свойство установки; контракт, прибитый к ней,
    // пришлось бы менять от машины к машине. Отказ при отсутствии
    // ffmpeg приходит кодом recording_needs_ffmpeg, а не ошибкой схемы:
    // это не «прислано негодное», а «эта установка такого не умеет».
    for (const type of UPLOAD_TYPES) {
      expect(() =>
        transcriptionRequestSchema.parse({ occurredOn: '2026-11-17', title: 'С', uploadType: type }),
      ).not.toThrow();
    }
  });

  it('отвергает контейнер вне широкого списка', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: '2026-11-17',
        title: 'Созвон',
        uploadType: 'video/x-msvideo',
      }),
    ).toThrow();
  });

  it('отвергает пустую дату события', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: null,
        title: 'Созвон',
        uploadType: 'video/mp4',
      }),
    ).toThrow();
  });

  it('отвергает заголовок длиннее записи хроники', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: '2026-11-17',
        title: 'я'.repeat(301),
        uploadType: 'video/mp4',
      }),
    ).toThrow();
  });

  it('отвергает лишнее поле', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: '2026-11-17',
        title: 'Созвон',
        uploadType: 'video/mp4',
        fileName: 'Клиент Б, разбор инцидента.mp4',
      }),
    ).toThrow();
  });
});

describe('настройки службы расшифровки', () => {
  it('называют узел, модель, оба предела и принимаемые контейнеры', () => {
    const parsed = transcriberInfoSchema.parse({
      isEnabled: true,
      kind: TranscriberKind.External,
      host: 'stt.api.cloud.yandex.net',
      model: 'general',
      maxUploadBytes: 2_147_483_648,
      maxSendBytes: 41_943_040,
      canExtract: true,
      acceptedTypes: [...UPLOAD_TYPES],
      audioBitrate: '24k',
    });

    expect(parsed.maxUploadBytes).toBeGreaterThan(parsed.maxSendBytes);
  });

  it('без ffmpeg принимаемый список сужается до того, что берёт служба', () => {
    // Список считает сервер: вычитать его в браузере значило бы завести
    // второе место, где живёт правило, и первым же расхождением
    // показать человеку формат, который сервер отвергнет.
    const parsed = transcriberInfoSchema.parse({
      isEnabled: true,
      kind: TranscriberKind.External,
      host: 'stt.api.cloud.yandex.net',
      model: 'general',
      maxUploadBytes: 2_147_483_648,
      maxSendBytes: 41_943_040,
      canExtract: false,
      acceptedTypes: [...SERVICE_AUDIO_TYPES],
      audioBitrate: null,
    });

    expect(parsed.acceptedTypes).toHaveLength(3);
  });

  it('у выключенной службы узла и модели нет', () => {
    // Называть узел, куда ничего не уходит, значило бы врать подписью.
    const parsed = transcriberInfoSchema.parse({
      isEnabled: false,
      kind: TranscriberKind.External,
      host: null,
      model: null,
      maxUploadBytes: 2_147_483_648,
      maxSendBytes: 41_943_040,
      canExtract: true,
      acceptedTypes: [],
      audioBitrate: '24k',
    });

    expect(parsed.host).toBeNull();
  });

  it('ключа в настройках нет: он не доезжает до интерфейса', () => {
    // Сторож на самое дорогое: ключ не выходит ни в ответ ручки, ни в
    // журнал. Поля под него в схеме нет вовсе.
    const parsed = transcriberInfoSchema.parse({
      isEnabled: true,
      kind: TranscriberKind.External,
      host: 'stt.api.cloud.yandex.net',
      model: 'general',
      maxUploadBytes: 2_147_483_648,
      maxSendBytes: 41_943_040,
      canExtract: true,
      acceptedTypes: [...UPLOAD_TYPES],
      audioBitrate: '24k',
      apiKey: 'ключ',
    });

    expect('apiKey' in parsed).toBe(false);
  });
});

describe('коды отказов', () => {
  it('отказы извлечения отделены от отказов службы', () => {
    // Шесть кодов про извлечение появились вместе с отменой решения
    // «только аудио»: до неё отказывать было нечему.
    expect(RECORDING_NEEDS_FFMPEG).toBe('recording_needs_ffmpeg');
    expect(RECORDING_NO_AUDIO_TRACK).toBe('recording_no_audio_track');
    expect(RECORDING_BROKEN).toBe('recording_broken');
    expect(RECORDING_CODEC_UNSUPPORTED).toBe('recording_codec_unsupported');
    expect(EXTRACTION_FAILED).toBe('extraction_failed');
    expect(EXTRACTION_TIMED_OUT).toBe('extraction_timed_out');
  });

  it('два предела — два разных кода', () => {
    // `recording_too_large` — человек прислал слишком большой файл и
    // может прислать другой; `transcription_too_large` — созвон слишком
    // длинный, и сократить его нельзя (дизайн, 4).
    expect(RECORDING_TOO_LARGE).toBe('recording_too_large');
    expect(TRANSCRIPTION_TOO_LARGE).toBe('transcription_too_large');
  });

  it('пределы по умолчанию взяты из чужих пределов, а не придуманы', () => {
    // 2 ГиБ — четыре часа 720p, столько служба вообще берёт по
    // длительности; 40 МиБ — 60 МБ тела запроса с запасом на base64.
    expect(DEFAULT_MAX_UPLOAD_BYTES).toBe(2_147_483_648);
    expect(DEFAULT_MAX_SEND_BYTES).toBe(41_943_040);
  });
});
