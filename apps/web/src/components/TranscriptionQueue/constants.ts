import {
  EXTRACTION_FAILED,
  EXTRACTION_TIMED_OUT,
  RECORDING_BROKEN,
  RECORDING_CODEC_UNSUPPORTED,
  RECORDING_MISSING,
  RECORDING_NEEDS_FFMPEG,
  RECORDING_NO_AUDIO_TRACK,
  TRANSCRIBER_DISABLED,
  TRANSCRIBER_UNAVAILABLE,
  TRANSCRIPTION_CANCELLED,
  TRANSCRIPTION_EMPTY,
  TRANSCRIPTION_INTERRUPTED,
  TRANSCRIPTION_NO_ACCESS,
  TRANSCRIPTION_TIMED_OUT,
  TRANSCRIPTION_TOO_LARGE,
  TranscriptionState,
} from '@cairn/shared';

import { megabytesOf } from '@/utils';

/** Заголовки столбцов очереди. */
export const COLUMNS = ['Дата', 'Заголовок', 'Проект', 'Размер', 'Состояние', 'Идёт', ''] as const;

/** Тексты блока очереди. */
export const QUEUE_TEXTS = {
  heading: 'Расшифровки',
  cancel: 'Отменить',
  retry: 'Расшифровать снова',
  remove: 'Удалить',
  removeLabel: 'Удаление загруженной записи',
  removeConfirm: 'Удалить задачу',
  /**
   * Удаление уносит файлы, и вернуть их нечем.
   *
   * Подтверждение здесь не формальность: у неудавшейся расшифровки
   * загруженный файл **остаётся** на томе (дизайн, 7.5), и для записи,
   * которую выгружали по медленному каналу, это единственная копия.
   */
  removeQuestion:
    'Загруженная запись будет удалена вместе с задачей. Вернуть её будет нечем — файл есть только здесь.',
  /** Клетке сказать нечего: задача закончилась или паспорта у неё нет. */
  dash: '—',
  /**
   * Заголовок повторной расшифровки.
   *
   * У неё нет ни даты, ни заголовка: паспорт принадлежит записи хроники, и
   * второй его копии в задаче не бывает (дизайн, 2.1). Пустая клетка
   * читалась бы как «заголовок потеряли», а дата саммари в очередь не
   * приходит — спрашивать её ради одной строки незачем.
   */
  repeat: 'Повторная расшифровка',
} as const;

/**
 * Состояния словами (дизайн, 8.3).
 *
 * `done` в этой карте нет намеренно: успешная расшифровка из очереди
 * уходит — саммари появилось в истории ниже, и две строки об одном были бы
 * двумя правдами. `failed` тоже нет: там говорит не состояние, а причина.
 */
export const STATE_LABELS: Partial<Record<TranscriptionState, string>> = {
  [TranscriptionState.Queued]: 'В очереди',
  [TranscriptionState.Extracting]: 'Извлекаем звуковую дорожку',
  [TranscriptionState.Sending]: 'Отправляем дорожку службе',
  [TranscriptionState.Running]: 'Расшифровывается',
};

/**
 * Причины неудач словами, по коду из контракта.
 *
 * По коду, а не по фразе ответа: фразу можно переписать, код — нет. Фразы
 * различаются не ради разнообразия, а потому что **человек делает по ним
 * разное** (дизайн, 7.5): `recording_no_audio_track` — выгрузить созвон
 * заново со звуком; `recording_broken` — выгрузить заново целиком;
 * `extraction_failed` — просто нажать «Расшифровать снова», потому что
 * причина у нас. Один общий текст «не вышло» отправил бы его делать не то.
 */
export const FAILURE_MESSAGES: Record<string, string> = {
  [RECORDING_NO_AUDIO_TRACK]: 'В файле нет звука: похоже, выгрузили только видео. Выгрузите созвон заново со звуком.',
  [RECORDING_BROKEN]: 'Файл не читается: возможно, выгрузка оборвалась. Выгрузите запись заново целиком.',
  [RECORDING_CODEC_UNSUPPORTED]: 'Звук в формате, который мы не умеем раскодировать.',
  [EXTRACTION_FAILED]: 'Не удалось извлечь звуковую дорожку. Причина у нас: попробуйте ещё раз.',
  [EXTRACTION_TIMED_OUT]: 'Извлечение дорожки не завершилось за отведённое время.',
  [TRANSCRIPTION_TOO_LARGE]: 'Созвон слишком длинный: дорожка не уместилась в предел отправки. Разделите запись.',
  [RECORDING_NEEDS_FFMPEG]: 'Эта установка принимает только MP3, WAV и OGG: извлечение дорожки не настроено.',
  [RECORDING_MISSING]: 'Записи на томе больше нет: расшифровывать нечего.',
  [TRANSCRIBER_DISABLED]: 'Расшифровка записи не настроена: обратитесь к администратору.',
  [TRANSCRIBER_UNAVAILABLE]: 'Служба расшифровки не ответила.',
  [TRANSCRIPTION_EMPTY]: 'В записи не распознано ни слова: проверьте, что дорожка не пустая.',
  [TRANSCRIPTION_INTERRUPTED]: 'Передача прервана перезапуском, исход неизвестен.',
  [TRANSCRIPTION_TIMED_OUT]: 'Расшифровка не завершилась за отведённое время.',
  [TRANSCRIPTION_CANCELLED]: 'Отменено.',
  [TRANSCRIPTION_NO_ACCESS]: 'Доступ к проекту отозван, пока шла расшифровка.',
};

/** Состояния, у которых работа ещё идёт. */
export const UNCLOSED_STATES = [
  TranscriptionState.Queued,
  TranscriptionState.Extracting,
  TranscriptionState.Sending,
  TranscriptionState.Running,
];

/**
 * Размеры строки: что загрузили и что уйдёт наружу.
 *
 * Два числа, а не одно, потому что это два разных вопроса, и строка
 * очереди — единственное место, где человеку видно второе (дизайн, 8.3).
 * Дорожки ещё нет — показывается одно: обещать «→ 11 МБ» до извлечения
 * было бы обещанием неизвестного.
 */
export function sizesOf(uploadBytes: number, audioBytes: number | null): string {
  if (audioBytes === null || audioBytes === uploadBytes) {
    return megabytesOf(uploadBytes);
  }

  return `${megabytesOf(uploadBytes)} → ${megabytesOf(audioBytes)}`;
}

/**
 * Сколько идёт работа — от приёма записи до сейчас.
 *
 * Время, а не процент: процента у расшифровки нет и быть не может —
 * `GET /operations/{id}` отвечает «готово/не готово», и свой придуманный
 * процент был бы враньём о чужой работе.
 */
export function elapsedOf(startedAt: string, now: number): string {
  const minutes = Math.floor((now - new Date(startedAt).getTime()) / 60_000);

  if (minutes < 1) {
    return 'меньше минуты';
  }

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

/** Причина неудачи словами либо сам код: пропуск не прячет исход. */
export function failureTextOf(code: string | null): string {
  if (code === null) {
    return 'Не вышло.';
  }

  return FAILURE_MESSAGES[code] ?? `Не вышло: ${code}`;
}
