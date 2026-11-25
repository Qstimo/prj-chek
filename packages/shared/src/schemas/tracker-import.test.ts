import { describe, expect, it } from 'vitest';
import { trackerImportQuerySchema, trackerImportRequestSchema } from './tracker-import';

describe('импорт из трекера: контракт', () => {
  it('задаёт открытые задачи и срок по умолчанию', () => {
    expect(trackerImportQuerySchema.parse({ boardId: '11' })).toEqual({
      boardId: '11',
      status: 'open',
      dateField: 'dueAt',
    });
  });
  it('не принимает невозможные даты и перевёрнутый диапазон', () => {
    expect(
      trackerImportQuerySchema.safeParse({ boardId: '11', dateFrom: '2026-02-30' }).success,
    ).toBe(false);
    expect(
      trackerImportQuerySchema.safeParse({
        boardId: '11',
        dateFrom: '2026-11-25',
        dateTo: '2026-11-24',
      }).success,
    ).toBe(false);
  });
  it('принимает только идентификаторы, а не клиентскую формулировку или происхождение', () => {
    expect(
      trackerImportRequestSchema.safeParse({
        boardId: '11',
        externalIds: ['42'],
        title: 'Подмена',
        origin: 'tracker',
      }).success,
    ).toBe(false);
  });
  it('ограничивает размер и повторы набора', () => {
    expect(
      trackerImportRequestSchema.safeParse({ boardId: '11', externalIds: ['42', '42'] }).success,
    ).toBe(false);
    expect(
      trackerImportRequestSchema.safeParse({
        boardId: '11',
        externalIds: Array.from({ length: 51 }, (_, i) => String(i + 1)),
      }).success,
    ).toBe(false);
    expect(trackerImportRequestSchema.safeParse({ boardId: '11', externalIds: [] }).success).toBe(
      false,
    );
  });
});
