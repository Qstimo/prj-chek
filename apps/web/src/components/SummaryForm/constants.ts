import {
  RECORDING_NEEDS_FFMPEG,
  RECORDING_NOT_AUDIO,
  RECORDING_TOO_LARGE,
  RECORDING_TYPE_NOT_ACCEPTED,
  TRANSCRIBER_DISABLED,
  TranscriberKind,
  type TranscriberInfo,
} from '@cairn/shared';

import { limitOf } from '@/utils';

/**
 * Предел размера загружаемого файла в байтах.
 *
 * Чуть больше предела текста в контракте (65 536 знаков), потому что
 * знак русского текста в UTF-8 занимает два байта: иначе отказ приходил
 * бы по размеру там, где текст в предел помещается.
 */
export const MAX_FILE_BYTES = 192 * 1024;

/** Расширения, которые принимаются. Решает расширение, а не MIME. */
export const ALLOWED_EXTENSIONS = ['.txt', '.md'] as const;

/** Отказы чтения файла. Фразы объясняют, что делать дальше. */
export const FILE_ERRORS = {
  tooBig: 'Файл больше 192 КБ. Вставьте текст в поле или разделите на два саммари.',
  extension: 'Принимаются только файлы .txt и .md. Вставьте текст в поле.',
  encoding: 'Не удалось прочитать файл. Сохраните его в UTF-8.',
} as const;

/** Подписи полей формы создания. */
export const FIELD_LABELS = {
  projectId: 'Проект',
  occurredOn: 'Дата созвона',
  title: 'Заголовок',
  text: 'Текст саммари',
  file: 'Загрузить файл',
  source: 'Чем дать текст',
  recording: 'Загрузить запись',
} as const;

/** Способы дать текст саммари. Третий — запись созвона. */
export enum SummarySource {
  Text = 'text',
  Recording = 'recording',
}

/** Подписи способов в переключателе. */
export const SOURCE_LABELS: Record<SummarySource, string> = {
  [SummarySource.Text]: 'Текст',
  [SummarySource.Recording]: 'Запись созвона',
};

/** Тексты формы создания. */
export const FORM_TEXTS = {
  noProjects: 'Нет проектов, в которые вы можете писать хронику.',
  submit: 'Создать саммари',
  submitRecording: 'Загрузить запись и расшифровать',
  uploading: 'Запись отправляется. Не закрывайте страницу.',
  cancelUpload: 'Отменить загрузку',
  replaceLabel: 'Замена текста содержимым файла',
  replaceConfirm: 'Заменить',
  replaceQuestion: 'Поле текста не пусто: содержимое файла его заменит.',
  fileHint: 'Принимаются .txt и .md в UTF-8. Имя файла никуда не отправляется.',
  notPlain: 'В тексте есть управляющие символы. Вставьте его как обычный текст.',
  /** Отказ без узнанного кода: врать причиной нельзя. */
  unreadable: 'Не удалось прочитать запись.',
  /** Служба не настроена: предлагать загрузку впустую нельзя (дизайн, 7.5). */
  transcriberDisabled: 'Расшифровка записи не настроена',
} as const;

/** Обозначения контейнеров для человека: тип содержимого он не читает. */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  'audio/mpeg': 'MP3',
  'audio/ogg': 'OGG',
  'audio/wav': 'WAV',
  'audio/mp4': 'M4A',
  'audio/flac': 'FLAC',
  'audio/webm': 'WEBM',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
  'video/x-matroska': 'MKV',
  'video/webm': 'WEBM',
};

/**
 * Принимаемые форматы словами, по списку **с сервера**.
 *
 * Своя копия списка в браузере разошлась бы с серверной на первой же
 * установке без `ffmpeg`: там список сужен до трёх (дизайн, 4).
 * Повторяющиеся обозначения схлопываются — `audio/webm` и `video/webm`
 * для человека один и тот же WEBM.
 */
export function formatsOf(acceptedTypes: string[]): string {
  const labels = [...new Set(acceptedTypes.map((type) => TYPE_LABELS[type] ?? type))];

  if (labels.length < 2) {
    return labels.join('');
  }

  return `${labels.slice(0, -1).join(', ')} и ${labels[labels.length - 1]}`;
}

/**
 * Объяснение отказа чтения записи по коду из контракта.
 *
 * Пределы и список форматов называются **числами и словами с сервера**:
 * подставить своё значило бы соврать о чужой настройке — то же решение,
 * что у `maxChars` первой итерации.
 */
export function recordingErrorOf(
  code: string,
  transcriber: TranscriberInfo,
  maxBytes?: number,
): string | undefined {
  if (code === RECORDING_TOO_LARGE) {
    // Число — из отказа, если он пришёл с сервера: подставить своё
    // значило бы соврать о чужой настройке.
    return `Файл больше ${limitOf(maxBytes ?? transcriber.maxUploadBytes)}. Выгрузите созвон в меньшем качестве или разделите на части.`;
  }

  if (code === RECORDING_TYPE_NOT_ACCEPTED) {
    return `Эта установка принимает ${formatsOf(transcriber.acceptedTypes)}.`;
  }

  if (code === RECORDING_NOT_AUDIO) {
    return 'Это не похоже на запись в указанном формате. Проверьте, что выгрузка не оборвалась.';
  }

  if (code === RECORDING_NEEDS_FFMPEG) {
    return `Эта установка принимает ${formatsOf(transcriber.acceptedTypes)}: извлечение дорожки не настроено.`;
  }

  if (code === TRANSCRIBER_DISABLED) {
    return FORM_TEXTS.transcriberDisabled;
  }

  // Неизвестный код объясняет сервер своей фразой: выдумывать за него
  // значило бы объяснить не то, что случилось.
  return undefined;
}

/**
 * Постоянная подпись о передаче записи наружу (дизайн, 9.2).
 *
 * Не всплывающая и не скрываемая, и это сильнее, чем у текста: **в записи
 * есть всё сказанное**, включая то, чего в тексте не будет. Диалог, который
 * человек видит двадцатый раз за день, перестаёт читаться, поэтому правда
 * стоит на экране до нажатия.
 *
 * Что уходит, зависит от установки, и врать подписью нельзя: с `ffmpeg`
 * наружу едет **дорожка** и ни одного кадра видео, без него — сам
 * загруженный файл как есть. У своей службы в контуре запись не покидает
 * машину, и это тоже сказано прямо.
 */
export function recordingNoticeOf(transcriber: TranscriberInfo): string {
  if (!transcriber.isEnabled) {
    return FORM_TEXTS.transcriberDisabled;
  }

  const host = transcriber.host ?? 'настроенный узел';
  const model = transcriber.model === null ? '' : `, модель ${transcriber.model}`;
  const isLocal = transcriber.kind === TranscriberKind.Local;
  // `24k` — настройка узла, как её пишут в окружении; человеку она
  // показывается по-русски, и переводится это здесь, а не в настройке.
  const bitrate =
    transcriber.audioBitrate === null
      ? ''
      : `, ${transcriber.audioBitrate.replace(/k$/i, ' кбит/с')}`;

  return [
    isLocal
      ? `Расшифровку делает ${host} в вашем контуре${model}.`
      : `Расшифровку делает ${host}${model}.`,
    transcriber.canExtract
      ? `Из файла извлекается звуковая дорожка (моно, 16 кГц${bitrate}) и целиком уходит на этот адрес; видео не уходит.`
      : 'Файл целиком уходит на этот адрес как есть: извлечение дорожки на этой установке не настроено.',
    isLocal ? 'Запись не покидает машину вашего контура.' : '',
    'В записи есть всё сказанное, включая то, чего в тексте не будет.',
  ]
    .filter((part) => part.length > 0)
    .join(' ');
}

/** Подпись о пределе: человек узнаёт его до выгрузки, а не после. */
export function recordingHintOf(transcriber: TranscriberInfo): string {
  return `Принимаются ${formatsOf(transcriber.acceptedTypes)}, файл до ${limitOf(transcriber.maxUploadBytes)}. Имя файла никуда не отправляется.`;
}
