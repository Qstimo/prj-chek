import { SERVER_WARN_DAYS } from '@cairn/shared';

import { pluralize } from '@/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Состояние срока оплаты. */
export type PaidUntilState = 'ok' | 'soon' | 'expired' | 'unknown';

/** Срок оплаты в виде, готовом к отображению. */
export interface PaidUntilView {
  state: PaidUntilState;
  text: string;
}

/**
 * Приводит срок оплаты к состоянию и человеческому тексту.
 *
 * Порог берётся из контракта — тем же числом, что и предупреждение
 * в статусе: плашка и предупреждение обязаны загораться одновременно.
 * У машин это две недели, у доменов месяц, поэтому порог — аргумент.
 */
export function paidUntilView(
  paidUntil: string | null,
  now: Date,
  warnDays: number = SERVER_WARN_DAYS,
): PaidUntilView {
  if (!paidUntil) {
    return { state: 'unknown', text: 'Срок оплаты не указан' };
  }

  const days = daysUntil(paidUntil, now);
  const date = formatDay(paidUntil);

  if (days < 0) {
    return { state: 'expired', text: `Оплата истекла ${pluralDays(-days)} назад` };
  }

  if (days <= warnDays) {
    return { state: 'soon', text: `Оплачен до ${date} — через ${pluralDays(days)}` };
  }

  return { state: 'ok', text: `Оплачен до ${date}` };
}

/** Полных суток от начала сегодняшнего дня до срока; отрицательное — просрочка. */
function daysUntil(isoDay: string, now: Date): number {
  const target = Date.parse(`${isoDay}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Math.round((target - today) / DAY_MS);
}

/** Дата по русской локали: 12.01.2027. */
function formatDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-');

  return `${day}.${month}.${year}`;
}

/** Склоняет дни общим правилом: своя копия была бы третьей в проекте. */
function pluralDays(days: number): string {
  return pluralize(days, 'день', 'дня', 'дней');
}
