import { describe, expect, it } from 'vitest';

import { paidUntilView } from './utils';

const NOW = new Date('2026-09-10T12:00:00Z');

describe('вид срока оплаты', () => {
  it('без срока — состояние «неизвестно»', () => {
    expect(paidUntilView(null, NOW)).toEqual({
      state: 'unknown',
      text: 'Срок оплаты не указан',
    });
  });

  it('день окончания оплаты ещё не просрочка', () => {
    // Срок включительный: машина оплачена по этот день.
    expect(paidUntilView('2026-09-10', NOW).state).toBe('soon');
  });

  it('ровно две недели — уже предупреждение', () => {
    expect(paidUntilView('2026-09-24', NOW).state).toBe('soon');
    expect(paidUntilView('2026-09-25', NOW).state).toBe('ok');
  });

  it('склоняет дни', () => {
    expect(paidUntilView('2026-09-09', NOW).text).toBe('Оплата истекла 1 день назад');
    expect(paidUntilView('2026-09-08', NOW).text).toBe('Оплата истекла 2 дня назад');
    expect(paidUntilView('2026-08-30', NOW).text).toBe('Оплата истекла 11 дней назад');
  });

  it('дату показывает по русской локали', () => {
    expect(paidUntilView('2027-01-12', NOW).text).toBe('Оплачен до 12.01.2027');
  });
});
