import type { Incident } from '@cairn/shared';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Склоняет единицу по числу: формы для 1, для 2–4 и для остальных.
 *
 * Своя копия, а не общая с API: это другое приложение, и тащить из него
 * код нельзя. Понадобится вебу во втором месте — переедет в `src/utils`.
 */
export function pluralOf(count: number, forms: [string, string, string]): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return forms[2];
  }

  if (last === 1) {
    return forms[0];
  }

  return last >= 2 && last <= 4 ? forms[1] : forms[2];
}

/** «не отвечает с 14:20» — время начала открытого инцидента. */
export function downSinceTextOf(startedAt: string): string {
  const at = new Date(startedAt);
  const isToday = at.toDateString() === new Date().toDateString();
  const time = at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // Вчерашнее падение без даты выглядело бы свежим.
  return isToday
    ? `не отвечает с ${time}`
    : `не отвечает с ${at.toLocaleDateString('ru-RU')}, ${time}`;
}

/** «падал 3 раза» — сколько закрытых инцидентов известно. */
export function fallCountTextOf(count: number): string {
  return `падал ${count} ${pluralOf(count, ['раз', 'раза', 'раз'])}`;
}

/** Длительность закрытого инцидента: минуты до часа, дальше часы. */
export function durationTextOf(incident: Incident): string {
  if (!incident.resolvedAt) {
    return '';
  }

  const elapsed = new Date(incident.resolvedAt).getTime() - new Date(incident.startedAt).getTime();

  if (elapsed < MINUTE_MS) {
    return 'меньше минуты';
  }

  if (elapsed < HOUR_MS) {
    const minutes = Math.round(elapsed / MINUTE_MS);

    return `${minutes} ${pluralOf(minutes, ['минуту', 'минуты', 'минут'])}`;
  }

  const hours = Math.round(elapsed / HOUR_MS);

  return `${hours} ${pluralOf(hours, ['час', 'часа', 'часов'])}`;
}

/** День падения для строки списка. */
export function dayTextOf(startedAt: string): string {
  return new Date(startedAt).toLocaleDateString('ru-RU');
}
