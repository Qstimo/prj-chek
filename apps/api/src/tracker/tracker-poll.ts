/** Имя переменной интервала тика. `0` выключает цикл целиком. */
export const TRACKER_POLL_ENV = 'CAIRN_TRACKER_POLL_SECONDS';

/** Как часто спрашиваем трекер о состоянии задач, в секундах. */
export const DEFAULT_TRACKER_POLL_SECONDS = 600;

/** Интервал опроса: 10 минут по умолчанию; 0 явно выключает цикл.
 * Пустое, отрицательное и нечисловое значение используют умолчание.
 */
export function trackerPollSecondsOf(value: string | undefined): number {
  if (value !== undefined && value.trim() === '0') {
    return 0;
  }

  const seconds = Number(value);

  // `Number('')` — нуль, и пустая строка иначе выключила бы цикл: отсюда
  // проверка на положительность, а не на конечность.
  return Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds)
    : DEFAULT_TRACKER_POLL_SECONDS;
}
