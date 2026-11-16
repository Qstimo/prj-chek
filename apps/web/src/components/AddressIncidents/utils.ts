import type { Incident } from '@cairn/shared';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

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

/**
 * «падал 3 раза за 30 дней» — сколько падений задело окно.
 *
 * Окно названо рядом с числом: «падал 3 раза» без окна читается как
 * утверждение за всё время, а считается последний месяц. Само окно
 * приходит из контракта — зашивать тридцатку здесь значило бы разойтись
 * с сервером при первой же его правке.
 */
export function fallCountTextOf(count: number, windowDays: number): string {
  const falls = pluralOf(count, ['раз', 'раза', 'раз']);
  const days = pluralOf(windowDays, ['день', 'дня', 'дней']);

  return `падал ${count} ${falls} за ${windowDays} ${days}`;
}

/**
 * Суммарное время «не отвечает» за окно.
 *
 * Две старшие непустые единицы, не больше: «1 д 2 ч 15 мин 3 с» никому не
 * нужен, а «1 д» скрыл бы разницу между сутками и сутками с лишним.
 */
export function downtimeTextOf(seconds: number): string {
  if (seconds <= 0) {
    return 'не падал ни разу';
  }

  if (seconds < MINUTE_S) {
    return 'меньше минуты';
  }

  const days = Math.floor(seconds / DAY_S);
  const hours = Math.floor((seconds % DAY_S) / HOUR_S);
  const minutes = Math.floor((seconds % HOUR_S) / MINUTE_S);

  const parts = [
    days > 0 ? `${days} д` : null,
    hours > 0 ? `${hours} ч` : null,
    minutes > 0 ? `${minutes} мин` : null,
  ].filter((part): part is string => part !== null);

  return parts.slice(0, 2).join(' ');
}

/**
 * Доля времени, когда адрес отвечал.
 *
 * Округление вниз: «100%» у адреса, который за окно падал, — ложное
 * успокоение, а два знака после запятой и есть разница между девятками.
 */
export function uptimeTextOf(uptime: number): string {
  const percent = Math.floor(uptime * 10_000) / 100;

  return `${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
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
