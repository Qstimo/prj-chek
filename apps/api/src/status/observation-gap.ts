/** Отрезок времени, за который наблюдения не было. */
export interface ObservationGap {
  startedAt: Date;
  endedAt: Date;
}

/**
 * Во сколько интервалов обхода укладывается нормальная задержка прогона.
 *
 * Два: прогон идёт столько, сколько отвечает сеть, и следующий начинается
 * не раньше, чем кончился этот. Объявлять пропуском каждую задержку на
 * одну длительность значило бы записывать в пропуски обычную работу.
 */
export const SILENCE_INTERVALS = 2;

/**
 * Пропуск наблюдения, если между проверками прошло слишком много.
 *
 * Тишину видит только тот прогон, который за ней последовал: пока
 * проверок не было, сказать о них нечего и некому. Поэтому отрезок
 * записывается задним числом — от последнего наблюдения до начала этого
 * прогона.
 *
 * @param lastObservedAt последняя запись любой проверки; `null` — система
 * не наблюдала ещё никогда.
 * @param intervalMinutes настроенный интервал обхода; `0` и мусор
 * означают «цикл выключен», и регулярного наблюдения никто не обещал.
 * @returns `null`, если записывать нечего.
 */
export function silenceGapOf(
  lastObservedAt: Date | null,
  now: Date,
  intervalMinutes: number,
): ObservationGap | null {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return null;
  }

  if (lastObservedAt === null) {
    return null;
  }

  const silenceMs = now.getTime() - lastObservedAt.getTime();
  const allowedMs = intervalMinutes * SILENCE_INTERVALS * 60 * 1000;

  // Строго больше: ровно два интервала — ещё норма, а не потеря.
  return silenceMs > allowedMs ? { startedAt: lastObservedAt, endedAt: now } : null;
}
