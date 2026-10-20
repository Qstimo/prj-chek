/**
 * Склоняет единицу по числу: формы для 1, для 2–4 и для остальных.
 *
 * Правило живёт в одном месте: его просят и предупреждения о просрочке,
 * и длительность падения в уведомлении.
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

  if (last >= 2 && last <= 4) {
    return forms[1];
  }

  return forms[2];
}
