import { TranscriptionState, type SummaryDetail } from '@cairn/shared';

import { megabytesOf } from '@/utils';

/** Тексты блока записи созвона. */
export const RECORDING_TEXTS = {
  heading: 'Запись',
  /**
   * Записи нет: либо дорожку убрали, либо тома нет вовсе.
   *
   * Вместо проверки существования файла на каждом показе — обработка
   * отказа `recording_missing` при чтении (дизайн, 3.5).
   */
  missing: 'Запись недоступна',
  retry: 'Расшифровать снова',
  retryLabel: 'Повторная расшифровка записи',
  retryConfirm: 'Заменить текст',
  /**
   * Повтор пишет в ту же колонку `content`, что правил человек.
   *
   * Молча заменять правленный текст нельзя — то же правило, по которому
   * первая итерация спрашивает подтверждение у повторной разбивки на
   * задачи (дизайн, 8.5).
   */
  retryQuestion:
    'Текст саммари будет заменён новой расшифровкой. Ваши правки текста пропадут, а задачи будут помечены возможно устаревшими.',
} as const;

/**
 * Идёт ли работа по этой расшифровке.
 *
 * `done` и `failed` терминальны: из них переходов нет, и «Расшифровать
 * снова» заводит **новую** строку, а не оживляет старую (дизайн, 2.3).
 */
export function isWorkingState(state: TranscriptionState): boolean {
  return state !== TranscriptionState.Done && state !== TranscriptionState.Failed;
}

/**
 * Строка о записи: что слушаем и что было загружено.
 *
 * Два варианта, а не один с условной половиной фразы, потому что у саммари
 * из `mp3` исходник и дорожка — **один файл**, и говорить «исходник убран»
 * было бы неправдой (дизайн, 3.3 следствие 3).
 *
 * Чем был исходник — видео или аудио — читается из его типа содержимого, а
 * не предполагается: крупный `mp3` тоже перекодируется, и «загружено было
 * видео» соврало бы о том, что человек загружал своими руками.
 */
export function recordingNoteOf(recording: NonNullable<SummaryDetail['recording']>): string {
  if (!recording.isSourceRemoved) {
    return `Запись созвона: ${megabytesOf(recording.bytes)}.`;
  }

  const kind = recording.uploadType.startsWith('video/') ? 'видео' : 'аудио';

  return `Запись созвона: дорожка ${megabytesOf(recording.bytes)}. Загружено было ${kind} ${megabytesOf(recording.uploadBytes)}, исходник убран после расшифровки.`;
}
