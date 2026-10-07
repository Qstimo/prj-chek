import { describe, expect, it } from 'vitest';

import { RoadmapVersionState } from '../enums';
import {
  publicCheckpointSchema,
  publicRoadmapSchema,
  roadmapCheckpointCreateSchema,
  roadmapCheckpointSchema,
  roadmapCheckpointUpdateSchema,
  roadmapResponseSchema,
  roadmapVersionCreateSchema,
  roadmapVersionMetadataSchema,
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

  it('принимает дату релиза при создании', () => {
    expect(
      roadmapVersionCreateSchema.parse({ label: 'v1', releasedDate: '2026-09-01' }).releasedDate,
    ).toBe('2026-09-01');
    expect(
      roadmapVersionCreateSchema.parse({ label: 'v1', releasedDate: null }).releasedDate,
    ).toBeNull();
  });

  it('отклоняет дату релиза не в формате ГГГГ-ММ-ДД', () => {
    expect(() =>
      roadmapVersionCreateSchema.parse({ label: 'v1', releasedDate: '01.09.2026' }),
    ).toThrow();
  });

  it('метаданные версии содержат дату релиза', () => {
    const version = roadmapVersionMetadataSchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      label: 'v1',
      state: RoadmapVersionState.Released,
      plannedDate: null,
      releasedDate: '2026-09-01',
      position: 1,
      progress: { done: 0, total: 0 },
    });

    expect(version.releasedDate).toBe('2026-09-01');
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

describe('ссылка на задачу у чекпоинта', () => {
  const checkpoint = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Перевести биллинг',
    isDone: false,
    position: 1,
    platformIds: [],
  };

  it('принимает ссылку на задачу', () => {
    const parsed = roadmapCheckpointSchema.parse({
      ...checkpoint,
      url: 'https://tracker.example.com/TASK-17',
    });

    expect(parsed.url).toBe('https://tracker.example.com/TASK-17');
  });

  it('принимает отсутствие ссылки', () => {
    expect(roadmapCheckpointSchema.parse({ ...checkpoint, url: null }).url).toBeNull();
  });

  it('отвергает то, что не адрес', () => {
    expect(() => roadmapCheckpointSchema.parse({ ...checkpoint, url: 'TASK-17' })).toThrow();
  });

  it('не пускает ссылку в публичный роадмап', () => {
    const version = {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'v1',
      state: RoadmapVersionState.Planned,
      plannedDate: null,
      releasedDate: null,
      position: 1,
      progress: { done: 0, total: 1 },
      releases: [],
      checkpoints: [{ ...checkpoint, url: 'https://tracker.example.com/TASK-17' }],
    };

    expect(() =>
      publicRoadmapSchema.parse({
        projectName: 'Лавка',
        stage: { current: 1, total: 1 },
        versions: [version],
        summary: [],
      }),
    ).toThrow();
  });

  it('пропускает публичный роадмап без ссылок', () => {
    const version = {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'v1',
      state: RoadmapVersionState.Planned,
      plannedDate: null,
      releasedDate: null,
      position: 1,
      progress: { done: 0, total: 1 },
      releases: [],
      checkpoints: [checkpoint],
    };

    expect(() =>
      publicRoadmapSchema.parse({
        projectName: 'Лавка',
        stage: { current: 1, total: 1 },
        versions: [version],
        summary: [],
      }),
    ).not.toThrow();
  });
});

describe('платформы в роадмапе', () => {
  it('чекпоинт несёт теги платформ, а публичный — без ссылки', () => {
    // Тег платформы говорит, куда поедет результат, и не делает чекпоинт
    // задачей трекера: ни исполнителя, ни оценки, ни даты у него нет (ТЗ 1.4).
    const fields = {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Вход по телефону',
      isDone: false,
      position: 1,
      platformIds: ['44444444-4444-4444-8444-444444444444'],
    };

    expect(publicCheckpointSchema.parse(fields).platformIds).toHaveLength(1);
    expect(() => publicCheckpointSchema.parse({ ...fields, url: 'https://tracker/1' })).toThrow();
  });

  it('правка чекпоинта принимает набор тегов и отвергает повторы', () => {
    const platformId = '44444444-4444-4444-8444-444444444444';

    // Положительный случай обязателен: схема и так строгая, и без него
    // тест прошёл бы на неизвестном ключе, а не на проверке повторов.
    expect(roadmapCheckpointUpdateSchema.parse({ platformIds: [platformId] }).platformIds).toEqual(
      [platformId],
    );
    expect(() =>
      roadmapCheckpointUpdateSchema.parse({ platformIds: [platformId, platformId] }),
    ).toThrow();
  });

  it('ответ роадмапа несёт сводку релизов', () => {
    const parsed = roadmapResponseSchema.parse({
      stage: { current: null, total: 0 },
      versions: [],
      summary: [],
    });

    expect(parsed.summary).toEqual([]);
  });
});
