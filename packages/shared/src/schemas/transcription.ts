import { z } from 'zod';

import { TranscriberKind, TranscriptionState } from '../enums';
import { requiredDaySchema } from './day-date';

/**
 * Предел загрузки по умолчанию: 2 ГиБ.
 *
 * Выведен из чужого предела, а не придуман: четыре часа — предел
 * длительности у службы, то есть самая длинная запись, которую вообще можно
 * распознать, а четыре часа записи экрана в 720p при ≈1,2 Мбит/с — это
 * ≈2160 МБ (дизайн, 3.6).
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 2_147_483_648;

/**
 * Предел отправки службе по умолчанию: 40 МиБ.
 *
 * Предел тела запроса у службы — 60 МБ, а в REST дорожка едет `base64`, то
 * есть ×1,333: 40 МиБ превращаются в 55,9 МБ и остаются под 60 МБ при любом
 * прочтении «к чему относится 60 МБ» (дизайн, 3.6).
 */
export const DEFAULT_MAX_SEND_BYTES = 41_943_040;

/**
 * Что служба принимает **как есть**, без извлечения.
 *
 * Список из документации SpeechKit: `OggOpus`, `MP3`, `WAV`. Принадлежит
 * адаптеру службы, а не контракту: у локального адаптера с `ffmpeg`
 * внутри он был бы шире, и прибитый к внешнему список занижал бы его.
 */
export const SERVICE_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav'] as const;

/**
 * Что принимает **загрузка**, когда извлечение доступно.
 *
 * Шире предыдущего ровно на то, что закрывает извлечение, и это и есть
 * смысл двух списков. Состав — то, что отдают живые инструменты: Zoom,
 * Meet и Teams — `mp4`; телефонные диктофоны — `m4a` и `mp3`; OBS —
 * `mkv`; запись в браузере — `webm`; `mov` — камеры и Apple. Это не
 * список «всего, что умеет `ffmpeg`»: он расширяется строкой, когда
 * появится ещё что-то живое, и сужать его до «только то, что мы
 * проверили» незачем — `ffmpeg` берёт всё это одинаково.
 */
export const UPLOAD_TYPES = [
  ...SERVICE_AUDIO_TYPES,
  'audio/mp4',
  'audio/flac',
  'audio/webm',
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
] as const;

/** Расшифровка как задача: состояние, причина, время. */
export const transcriptionJobSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  projectName: z.string(),
  /** Саммари, если оно уже родилось. `null` — первая расшифровка в работе. */
  summaryId: z.string().uuid().nullable(),
  /** Паспорт будущего саммари; у повторной расшифровки `null`. */
  occurredOn: requiredDaySchema.nullable(),
  title: z.string().nullable(),
  state: z.nativeEnum(TranscriptionState),
  transcriber: z.nativeEnum(TranscriberKind),
  model: z.string(),
  /** Куда ушла дорожка. Имя узла, без пути и без ключа. */
  host: z.string().nullable(),
  /** Что загрузил человек: размер и тип присланного файла. */
  uploadBytes: z.number().int().positive(),
  uploadType: z.string(),
  /**
   * Что уедет службе: размер и тип извлечённой дорожки.
   *
   * `null` — дорожки ещё нет (не извлекли или извлечение не удалось).
   * Когда извлечение не понадобилось, равны загруженным: это тот же
   * файл, а не копия.
   */
  audioBytes: z.number().int().positive().nullable(),
  audioType: z.string().nullable(),
  /** Дорожка ещё на томе: `false` — слушать нечего. */
  hasRecording: z.boolean(),
  /** Код отказа из списка ниже; `null` — отказа не было. */
  failureCode: z.string().nullable(),
  startedAt: z.string(),
  /** Когда запись покинула машину. `null` — не покидала. */
  sentAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

/**
 * Паспорт загружаемой записи: едет строкой запроса, а не телом.
 *
 * Телом едут сырые байты записи, и паспорт в нём места не имеет
 * (дизайн, 5.2). Границы значений взяты оттуда, куда значения поедут:
 * `title` — `max(300)`, столько у `chronicleEntryCreate.title`.
 */
export const transcriptionRequestSchema = z
  .object({
    occurredOn: requiredDaySchema,
    title: z.string().trim().min(1).max(300),
    /**
     * Что человек прислал — из широкого списка.
     *
     * Схема принимает весь список, а не только то, что примет данная
     * установка: доступность извлечения — свойство установки, и
     * контракт, прибитый к ней, пришлось бы менять от машины к машине.
     * Отказ при отсутствии `ffmpeg` приходит кодом
     * {@link RECORDING_NEEDS_FFMPEG}, а не ошибкой схемы, потому что это
     * не «прислано негодное», а «эта установка такого не умеет».
     */
    uploadType: z.enum(UPLOAD_TYPES),
  })
  .strict();

/** Настройки расшифровки, видимые пользователю. Ключа здесь нет. */
export const transcriberInfoSchema = z.object({
  isEnabled: z.boolean(),
  kind: z.nativeEnum(TranscriberKind),
  /** Имя узла из настроенного адреса, без пути и без ключа. */
  host: z.string().nullable(),
  model: z.string().nullable(),
  /** Предел загрузки: по нему браузер отказывает до чтения файла. */
  maxUploadBytes: z.number().int().positive(),
  /** Предел отправки службе: нужен, чтобы объяснить редкий отказ. */
  maxSendBytes: z.number().int().positive(),
  /**
   * Есть ли на этой установке `ffmpeg`.
   *
   * Экран по нему не ветвится: `acceptedTypes` уже посчитан сервером с
   * учётом этого признака. Признак нужен подписи — «видео
   * перекодируется у нас», — и объяснению отказа, если человек всё же
   * прислал видео мимо веба.
   */
  canExtract: z.boolean(),
  /**
   * Что реально примет загрузка на **этой** установке.
   *
   * Считает сервер: при `canExtract` — весь широкий список, иначе —
   * только то, что служба берёт как есть. Отдавать оба списка и
   * вычитать их в браузере значило бы завести второе место, где живёт
   * правило, и первым же расхождением показать человеку формат,
   * который сервер отвергнет.
   */
  acceptedTypes: z.array(z.string()),
  /** Битрейт извлекаемой дорожки: показывается в подписи о передаче. */
  audioBitrate: z.string().nullable(),
});

/** Расшифровка не настроена: ни ключа, ни каталога. */
export const TRANSCRIBER_DISABLED = 'transcriber_disabled';
/** Загружаемый файл больше предела загрузки (2 ГиБ). */
export const RECORDING_TOO_LARGE = 'recording_too_large';
/**
 * Извлечённая дорожка не уместилась в предел отправки.
 *
 * Отдельно от {@link RECORDING_TOO_LARGE}: там человек прислал слишком
 * большой файл и может прислать другой, здесь созвон слишком **длинный**
 * — почти четыре часа, — и сократить его нельзя, можно только разделить
 * (дизайн, 3.6).
 */
export const TRANSCRIPTION_TOO_LARGE = 'transcription_too_large';
/** Такой контейнер не принимает ни загрузка, ни извлечение. */
export const RECORDING_TYPE_NOT_ACCEPTED = 'recording_type_not_accepted';
/** Содержимое не похоже на объявленный контейнер. */
export const RECORDING_NOT_AUDIO = 'recording_not_audio';
/** Нужно извлечение, а `ffmpeg` на этой установке нет. */
export const RECORDING_NEEDS_FFMPEG = 'recording_needs_ffmpeg';
/** В файле нет звуковой дорожки: видео без звука. */
export const RECORDING_NO_AUDIO_TRACK = 'recording_no_audio_track';
/** Контейнер не разбирается: файл побился при выгрузке или передаче. */
export const RECORDING_BROKEN = 'recording_broken';
/** Дорожка есть, но её кодек `ffmpeg` не берёт. */
export const RECORDING_CODEC_UNSUPPORTED = 'recording_codec_unsupported';
/** Извлечение упало на полпути. */
export const EXTRACTION_FAILED = 'extraction_failed';
/** Извлечение не кончилось за отведённое время. */
export const EXTRACTION_TIMED_OUT = 'extraction_timed_out';
/** Записи на томе больше нет. */
export const RECORDING_MISSING = 'recording_missing';
/** Служба не ответила или ответила негодным. */
export const TRANSCRIBER_UNAVAILABLE = 'transcriber_unavailable';
/** Служба отработала, но не распознала ни слова. */
export const TRANSCRIPTION_EMPTY = 'transcription_empty';
/** Передача прервана перезапуском: исход неизвестен (дизайн, 2.4). */
export const TRANSCRIPTION_INTERRUPTED = 'transcription_interrupted';
/** Наше терпение кончилось раньше, чем работа у службы. */
export const TRANSCRIPTION_TIMED_OUT = 'transcription_timed_out';
/** Человек отменил. */
export const TRANSCRIPTION_CANCELLED = 'transcription_cancelled';
/** По этому саммари расшифровка уже идёт. */
export const TRANSCRIPTION_ALREADY_RUNNING = 'transcription_already_running';
/**
 * Выдачу отозвали, пока запись расшифровывалась (дизайн, 6.5).
 *
 * Кодом ответа не приходит никогда: право проверяется **на момент укладки
 * текста**, то есть через минуты после того, как ручка ответила `202`.
 * Поэтому это состояние задачи, а не отказ HTTP, — как и отказы извлечения.
 *
 * Единственный код, при котором файлы убираются, а не остаются: повторять
 * **некому** — у субъекта больше нет права писать в этот проект, а значит
 * нет и доступа к задаче.
 */
export const TRANSCRIPTION_NO_ACCESS = 'transcription_no_access';

/** Тип данных контракта расшифровки. */
export type TranscriptionJob = z.infer<typeof transcriptionJobSchema>;

/** Тип данных контракта расшифровки. */
export type TranscriptionRequest = z.infer<typeof transcriptionRequestSchema>;

/** Тип данных контракта расшифровки. */
export type TranscriberInfo = z.infer<typeof transcriberInfoSchema>;

/** Контейнер, принимаемый загрузкой. */
export type UploadType = (typeof UPLOAD_TYPES)[number];
