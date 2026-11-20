import { fallCountTextOf, uptimeTextOf } from '@/components/AddressIncidents';
import { pluralize } from '@/utils';

/**
 * Сколько раз адрес падал за окно — включая случай «ни разу».
 *
 * «Падал 0 раз за 30 дней» — формально верно и нечитаемо, поэтому ноль
 * сказан отдельной фразой. Окно называется в обеих: число без окна
 * читается как утверждение за всё время.
 */
export function fallsTextOf(falls: number, windowDays: number): string {
  if (falls === 0) {
    return `нет зарегистрированных падений за ${pluralize(windowDays, 'день', 'дня', 'дней')}`;
  }

  return fallCountTextOf(falls, windowDays);
}

/** «99,68% времени за 30 дней» — доля, посчитанная сервером за окно. */
export function uptimeSummaryTextOf(uptime: number, windowDays: number): string {
  return `${uptimeTextOf(uptime)} времени за ${pluralize(windowDays, 'день', 'дня', 'дней')}`;
}

/**
 * Чем объяснить время без наблюдения.
 *
 * Названо не «аптайм 100%», а «за это время мы не знаем ничего»: пустой
 * журнал падений означает и «адрес отвечал», и «никто не спрашивал», и
 * выдавать второе за первое — та самая ложь в плюс, из-за которой три
 * часа лежащего наблюдателя выглядели тремя часами исправной работы.
 *
 * Весь период без наблюдения назван особо: доли там нет вовсе, и
 * показывать её рядом было бы нечестно.
 */
export function unobservedNoteOf(seconds: number, windowDays: number): string {
  const windowSeconds = windowDays * 24 * 60 * 60;

  return seconds >= windowSeconds
    ? 'Проверок за это окно не было ни одной: судить не о чем.'
    : 'Проверок за это время не было: ни падений, ни работы.';
}
