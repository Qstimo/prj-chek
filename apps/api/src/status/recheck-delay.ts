/** Пауза перед переспросом по умолчанию, в секундах. */
export const DEFAULT_RECHECK_DELAY_SECONDS = 30;

/**
 * Сколько ждать перед переспросом упавшего адреса.
 *
 * Ручной запуск не ждёт вовсе: человек смотрит на кнопку «Проверить
 * сейчас», и держать запрос полминуты нельзя. Переспрос при этом
 * делается — просто сразу: немедленный повторный отказ отсеивает
 * одиночную икоту хуже отложенного, но лучше, чем никакой.
 *
 * `0`, мусор и отрицательное значение означают «переспросить сразу»,
 * а не «не переспрашивать»: выключателя у переспроса нет.
 */
export function recheckDelayMsOf(value: string | undefined, isManual: boolean): number {
  if (isManual) {
    return 0;
  }

  const seconds = Number(value ?? DEFAULT_RECHECK_DELAY_SECONDS);

  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}
