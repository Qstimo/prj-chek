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
