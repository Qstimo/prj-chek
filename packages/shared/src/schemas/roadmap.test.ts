import { describe, expect, it } from 'vitest';

import { PlatformReleaseState, RoadmapVersionState } from '../enums';
import {
  CARRY_OVER_NEEDS_LABEL,
  checkpointCarryOverResultSchema,
  checkpointCarryOverSchema,
  publicCheckpointSchema,
  publicReleaseReportSchema,
  publicRoadmapSchema,
  releaseReportSchema,
  reportReleaseSchema,
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
      unfinished: 0,
      hasUnfinishedOnRelease: false,
    });

    expect(version.releasedDate).toBe('2026-09-01');
  });

  it('метаданные несут признак расхождения «выпущено, но не закрыто»', () => {
    // Именно метаданные: публичная выдача расширяет их, и уровень
    // «метаданные» тоже обязан видеть расхождение.
    const version = roadmapVersionMetadataSchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      label: 'v1',
      state: RoadmapVersionState.Released,
      plannedDate: null,
      releasedDate: '2026-09-01',
      position: 1,
      progress: { done: 1, total: 3 },
      unfinished: 2,
      hasUnfinishedOnRelease: true,
    });

    expect(version.unfinished).toBe(2);
    expect(version.hasUnfinishedOnRelease).toBe(true);
  });

  it('требует признак расхождения, а не домысливает его', () => {
    // Поле обязательное: проекция, забывшая его посчитать, обязана
    // упасть на сборке ответа, а не тихо отдать «всё закрыто».
    expect(() =>
      roadmapVersionMetadataSchema.parse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        label: 'v1',
        state: RoadmapVersionState.Released,
        plannedDate: null,
        releasedDate: null,
        position: 1,
        progress: { done: 0, total: 0 },
      }),
    ).toThrow();
  });

  it('правка частична', () => {
    expect(roadmapVersionUpdateSchema.parse({ position: 2 }).position).toBe(2);
  });
});

describe('схема переноса чекпоинта', () => {
  const versionId = '55555555-5555-4555-8555-555555555555';

  it('принимает пустое тело — «следующая открытая версия»', () => {
    expect(checkpointCarryOverSchema.parse({})).toEqual({});
  });

  it('отсутствующее тело равно пустому', () => {
    // Запрос без тела — законная форма переноса, и разборщик HTTP
    // отдаёт в этом случае `undefined`, а не пустой объект.
    expect(checkpointCarryOverSchema.parse(undefined)).toEqual({});
  });

  it('принимает указанную версию', () => {
    expect(checkpointCarryOverSchema.parse({ targetVersionId: versionId }).targetVersionId).toBe(
      versionId,
    );
  });

  it('принимает обозначение новой версии', () => {
    expect(
      checkpointCarryOverSchema.parse({ newVersionLabel: ' v1.3 ' }).newVersionLabel,
    ).toBe('v1.3');
  });

  it('отвергает обе формы сразу', () => {
    // Сервер не решает за человека, какое из двух намерений главнее.
    expect(() =>
      checkpointCarryOverSchema.parse({ targetVersionId: versionId, newVersionLabel: 'v1.3' }),
    ).toThrow();
  });

  it('отвергает лишние поля и пустое обозначение', () => {
    expect(() => checkpointCarryOverSchema.parse({ position: 3 })).toThrow();
    expect(() => checkpointCarryOverSchema.parse({ newVersionLabel: '   ' })).toThrow();
  });

  it('результат называет версию-получателя', () => {
    const result = checkpointCarryOverResultSchema.parse({
      checkpoint: {
        id: '66666666-6666-4666-8666-666666666666',
        title: 'Оплата',
        isDone: false,
        position: 4,
        url: null,
        platformIds: [],
      },
      targetVersion: { id: versionId, label: 'v1.3' },
      versionCreated: true,
    });

    expect(result.targetVersion.label).toBe('v1.3');
    expect(result.versionCreated).toBe(true);
  });

  it('код отказа отличим от прочих конфликтов', () => {
    // По нему интерфейс спрашивает обозначение новой версии, а не
    // показывает общий «конфликт».
    expect(CARRY_OVER_NEEDS_LABEL).toBe('carry_over_needs_label');
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
      unfinished: 1,
      hasUnfinishedOnRelease: false,
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
      unfinished: 1,
      hasUnfinishedOnRelease: false,
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

  it('публичная версия обязана нести признак расхождения', () => {
    // Признак живёт в метаданных, а публичная версия их расширяет:
    // забыть провести его — значит не собрать публичную выдачу вовсе.
    const { unfinished: _unfinished, ...withoutFlag } = {
      id: '22222222-2222-4222-8222-222222222222',
      label: 'v1',
      state: RoadmapVersionState.Released,
      plannedDate: null,
      releasedDate: '2026-09-01',
      position: 1,
      progress: { done: 0, total: 1 },
      unfinished: 1,
      hasUnfinishedOnRelease: true,
      releases: [],
      checkpoints: [checkpoint],
    };

    expect(() =>
      publicRoadmapSchema.parse({
        projectName: 'Лавка',
        stage: { current: 1, total: 1 },
        versions: [withoutFlag],
        summary: [],
      }),
    ).toThrow();
  });
});

describe('схема отчёта по релизу', () => {
  const PLATFORM = {
    id: '77777777-7777-4777-8777-777777777777',
    kind: 'store',
    name: 'App Store',
    position: 1,
  };

  const CHECKPOINT = {
    id: '88888888-8888-4888-8888-888888888888',
    title: 'Оплата',
    isDone: true,
    position: 1,
    platformIds: [],
  };

  const VERSION = {
    id: '99999999-9999-4999-8999-999999999999',
    label: 'v1.2',
    state: RoadmapVersionState.Released,
    plannedDate: '2026-03-01',
    releasedDate: '2026-03-12',
    position: 2,
    progress: { done: 1, total: 1 },
    unfinished: 0,
    hasUnfinishedOnRelease: false,
  };

  /** Отчёт целиком: случаи отличаются от него одним полем. */
  const report = (overrides: Record<string, unknown> = {}) => ({
    version: VERSION,
    releases: [
      {
        platform: PLATFORM,
        state: PlatformReleaseState.Released,
        releasedDate: '2026-03-12',
        buildLabel: '1.2.3 (45)',
      },
    ],
    summary: [],
    checkpoints: [{ ...CHECKPOINT, url: null, carriedFrom: null }],
    carriedOut: [],
    markdown: '# Отчёт по релизу v1.2',
    text: 'Отчёт по релизу v1.2',
    ...overrides,
  });

  it('принимает отчёт с выпусками и чекпоинтами', () => {
    const parsed = releaseReportSchema.parse(report());

    expect(parsed.version.label).toBe('v1.2');
    expect(parsed.releases[0]?.buildLabel).toBe('1.2.3 (45)');
    expect(parsed.markdown).toContain('v1.2');
  });

  it('пустое состояние выпуска законно — «идёт вместе с версией»', () => {
    // Отсутствие строки выпуска означает не «неизвестно», а «едет вместе
    // с версией», и отчёт обязан уметь это сказать.
    const parsed = reportReleaseSchema.parse({
      platform: PLATFORM,
      state: null,
      releasedDate: null,
      buildLabel: null,
    });

    expect(parsed.state).toBeNull();
  });

  it('требует след переноса у чекпоинта, а не домысливает его', () => {
    // Поле обязательное: проекция, забывшая его заполнить, обязана упасть
    // на сборке ответа, а не тихо отдать «ниоткуда не приезжал».
    expect(() =>
      releaseReportSchema.parse(report({ checkpoints: [{ ...CHECKPOINT, url: null }] })),
    ).toThrow();
  });

  it('называет версию-получателя у перенесённого', () => {
    const parsed = releaseReportSchema.parse(
      report({ carriedOut: [{ ...CHECKPOINT, url: null, carriedTo: 'v1.3' }] }),
    );

    expect(parsed.carriedOut[0]?.carriedTo).toBe('v1.3');
    expect(() =>
      releaseReportSchema.parse({ ...report(), carriedOut: [{ ...CHECKPOINT, url: null }] }),
    ).toThrow();
  });

  it('не пускает ссылку на задачу в публичный отчёт', () => {
    // Страница открыта без авторизации: адрес внутреннего трекера с
    // номером задачи наружу уходить не должен (инвариант дизайна 1).
    expect(() =>
      publicReleaseReportSchema.parse({
        ...report({
          checkpoints: [
            { ...CHECKPOINT, url: 'https://tracker.example.com/TASK-17', carriedFrom: null },
          ],
        }),
        projectName: 'Лавка',
      }),
    ).toThrow();
  });

  it('для публичного отчёта `url: null` — такая же ошибка, как адрес', () => {
    // Проекция обязана поле **не добавлять**, а не обнулять: обнуление
    // прошло бы незаметно и в следующей правке вернулось бы адресом.
    expect(() =>
      publicReleaseReportSchema.parse({
        ...report({ checkpoints: [{ ...CHECKPOINT, url: null, carriedFrom: null }] }),
        projectName: 'Лавка',
      }),
    ).toThrow();
  });

  it('не пускает ссылку и у перенесённого чекпоинта', () => {
    // Второй список чекпоинтов легко забыть: он собирается отдельной
    // выборкой, а не проекцией версии.
    expect(() =>
      publicReleaseReportSchema.parse({
        ...report({
          carriedOut: [
            { ...CHECKPOINT, url: 'https://tracker.example.com/TASK-18', carriedTo: 'v1.3' },
          ],
        }),
        projectName: 'Лавка',
      }),
    ).toThrow();
  });

  it('пропускает публичный отчёт без ссылок', () => {
    const parsed = publicReleaseReportSchema.parse({
      ...report({
        checkpoints: [{ ...CHECKPOINT, carriedFrom: 'v1.1' }],
        carriedOut: [{ ...CHECKPOINT, carriedTo: 'v1.3' }],
      }),
      projectName: 'Лавка',
    });

    expect(parsed.projectName).toBe('Лавка');
    expect(parsed.checkpoints[0]?.carriedFrom).toBe('v1.1');
    expect(parsed.carriedOut[0]?.carriedTo).toBe('v1.3');
  });

  it('публичный отчёт строг и сверху, и в паспорте версии', () => {
    // Строгость наверху ловит случайно приехавшее поле, строгость в
    // паспорте — целиком подставленную проекцию чтения с чекпоинтами.
    expect(() =>
      publicReleaseReportSchema.parse({
        ...report({ checkpoints: [{ ...CHECKPOINT, carriedFrom: null }] }),
        projectName: 'Лавка',
        publicLinkToken: 'секрет',
      }),
    ).toThrow();

    expect(() =>
      publicReleaseReportSchema.parse({
        ...report({
          version: { ...VERSION, checkpoints: [], releases: [] },
          checkpoints: [{ ...CHECKPOINT, carriedFrom: null }],
        }),
        projectName: 'Лавка',
      }),
    ).toThrow();
  });

  it('требует готовый текст в обоих видах', () => {
    // Текст собирается на сервере: два экземпляра правила — внутренний и
    // клиентский — разошлись бы при первой же правке.
    const { markdown: _markdown, ...withoutMarkdown } = report();
    const { text: _text, ...withoutText } = report();

    expect(() => releaseReportSchema.parse(withoutMarkdown)).toThrow();
    expect(() => releaseReportSchema.parse(withoutText)).toThrow();
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
