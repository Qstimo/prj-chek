import { describe, expect, it } from 'vitest';

import { chronicleEntryCreateSchema } from './chronicle';
import { dayDateSchema } from './day-date';
import { intakePayloadSchema } from './intake';
import { isoDateSchema } from './server';

describe('дата-день', () => {
  it.each(['2026-08-27', '2024-02-29', '2026-12-31'])('принимает %s', (day) => {
    expect(dayDateSchema.safeParse(day).success).toBe(true);
  });

  it('принимает отсутствие даты', () => {
    expect(dayDateSchema.safeParse(null).success).toBe(true);
  });

  it.each(['2026-08-2', '27.08.2026', 'вчера', ''])('отвергает по форме %s', (day) => {
    expect(dayDateSchema.safeParse(day).success).toBe(false);
  });

  // Форма проверялась и раньше, а существование дня — нет: колонка в базе
  // имеет тип `date`, и несуществующий день доходил до неё, превращая
  // негодный ввод в падение сервера.
  it.each(['2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-32', '2025-02-29'])(
    'отвергает несуществующий день %s',
    (day) => {
      expect(dayDateSchema.safeParse(day).success).toBe(false);
    },
  );
});

describe('те же дни в остальных схемах контракта', () => {
  it('срок оплаты сервера не принимает несуществующий день', () => {
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-02-28').success).toBe(true);
  });

  it('дата события хроники не принимает несуществующий день', () => {
    const input = { occurredOn: '2026-02-30', title: 'Запись', content: 'Текст' };

    expect(chronicleEntryCreateSchema.safeParse(input).success).toBe(false);
  });

  it('приёмный канал не принимает несуществующий день', () => {
    const input = { content: 'Сводка со встречи', occurredOn: '2026-04-31' };

    expect(intakePayloadSchema.safeParse(input).success).toBe(false);
  });
});
