import { INCIDENT_WINDOW_DAYS, type AddressIncidents, type DomainStatus } from '@cairn/shared';

/**
 * Самая поздняя из проверок адресов проекта.
 *
 * То же правило, по которому сервер считает время проверки окружения:
 * раньше этой отметки сведения не устаревают. `null` — не проверялся ни
 * один адрес.
 */
export function lastCheckedAtOf(domains: DomainStatus[]): string | null {
  const checks = domains
    .map((domain) => domain.checkedAt)
    .filter((checkedAt): checkedAt is string => checkedAt !== null);

  return checks.length > 0 ? checks.reduce((last, next) => (next > last ? next : last)) : null;
}

/** Адреса, которым есть что рассказать: лежат сейчас либо падали в окне. */
export function fallenOf(incidents: AddressIncidents[]): AddressIncidents[] {
  return incidents.filter((row) => row.open !== null || row.past.length > 0);
}

/**
 * Окно, за которое посчитана лента.
 *
 * Берётся из первой строки: окно считает сервер и одинаково для всех
 * адресов проекта. Пустая лента окна не знает — тогда умолчание из
 * контракта, а не зашитое здесь число.
 */
export function windowDaysOf(incidents: AddressIncidents[]): number {
  return incidents[0]?.windowDays ?? INCIDENT_WINDOW_DAYS;
}
