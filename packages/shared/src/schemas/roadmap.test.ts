import { describe, expect, it } from 'vitest';

import {
  roadmapCheckpointCreateSchema,
  roadmapVersionCreateSchema,
  roadmapVersionUpdateSchema,
} from './roadmap';

describe('схема версии роадмапа', () => {
  it('принимает версию с обозначением', () => {
    const parsed = roadmapVersionCreateSchema.parse({ label: 'v1.0' });

    expect(parsed.label).toBe('v1.0');
  });

  it('требует непустое обозначение', () => {
    expect(() => roadmapVersionCreateSchema.parse({ label: '  ' })).toThrow();
    expect(() => roadmapVersionCreateSchema.parse({})).toThrow();
  });

  it('плановая дата — ISO-день или null', () => {
    expect(
      roadmapVersionCreateSchema.parse({ label: 'v1', plannedDate: '2026-12-01' }).plannedDate,
    ).toBe('2026-12-01');
    expect(
      roadmapVersionCreateSchema.parse({ label: 'v1', plannedDate: null }).plannedDate,
    ).toBeNull();
    expect(() =>
      roadmapVersionCreateSchema.parse({ label: 'v1', plannedDate: '01.12.2026' }),
    ).toThrow();
  });

  it('правка частична', () => {
    expect(roadmapVersionUpdateSchema.parse({ position: 2 }).position).toBe(2);
  });
});

describe('схема чекпоинта', () => {
  it('принимает формулировку', () => {
    expect(roadmapCheckpointCreateSchema.parse({ title: 'Готов вход' }).title).toBe('Готов вход');
  });

  it('отвергает лишние поля — у чекпоинта нет исполнителей и дат', () => {
    // ТЗ 1.4: сознательное ограничение, удерживающее продукт от трекера.
    expect(() =>
      roadmapCheckpointCreateSchema.parse({ title: 'X', assignee: 'кто-то' }),
    ).toThrow();
    expect(() =>
      roadmapCheckpointCreateSchema.parse({ title: 'X', dueDate: '2026-01-01' }),
    ).toThrow();
  });
});
