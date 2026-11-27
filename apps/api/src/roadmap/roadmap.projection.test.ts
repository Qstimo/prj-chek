import {
  AccessLevel,
  PlatformReleaseState,
  RoadmapVersionState,
  type PlatformRelease,
  type RoadmapVersionDetail,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { versionProjection } from './roadmap.projection';
import type { RoadmapVersionRow } from '../db/schema';
import type { LoadedCheckpointRow } from './roadmap.repository';

const version: RoadmapVersionRow = {
  id: '11111111-1111-1111-1111-111111111111',
  projectId: '22222222-2222-2222-2222-222222222222',
  label: 'v1.0',
  plannedDate: '2026-12-01',
  releasedDate: null,
  state: RoadmapVersionState.InProgress,
  position: 1,
  createdAt: new Date('2026-08-28T10:00:00Z'),
  updatedAt: new Date('2026-08-28T10:00:00Z'),
};

const checkpoints: LoadedCheckpointRow[] = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    versionId: version.id,
    // Формулировка и ссылка приходят из задачи join'ом: размещение их не
    // хранит, а проекция читает их у строки, которую отдал репозиторий.
    taskId: '33333333-3333-3333-3333-333333333330',
    title: 'Готов вход',
    url: 'https://tracker.example.com/TASK-17',
    isDone: true,
    position: 1,
    carriedFromVersionId: null,
    createdAt: new Date('2026-08-28T10:00:00Z'),
    updatedAt: new Date('2026-08-28T10:00:00Z'),
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    versionId: version.id,
    taskId: '44444444-4444-4444-4444-444444444440',
    title: 'Готовы проекты',
    url: null,
    isDone: false,
    position: 2,
    carriedFromVersionId: null,
    createdAt: new Date('2026-08-28T10:00:00Z'),
    updatedAt: new Date('2026-08-28T10:00:00Z'),
  },
];

describe('проекция версии', () => {
  it('на уровне метаданных отдаёт паспорт и прогресс без формулировок', () => {
    const projected = versionProjection(version, checkpoints, [], AccessLevel.Metadata);

    expect(projected).toEqual({
      id: version.id,
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: '2026-12-01',
      releasedDate: null,
      position: 1,
      progress: { done: 1, total: 2 },
      unfinished: 1,
      hasUnfinishedOnRelease: false,
    });
    expect(JSON.stringify(projected)).not.toContain('Готов вход');
  });

  it('на уровне чтения отдаёт чекпоинты по порядку', () => {
    const projected = versionProjection(
      version,
      checkpoints,
      [],
      AccessLevel.Read,
    ) as RoadmapVersionDetail;

    expect(projected.checkpoints.map((checkpoint) => checkpoint.title)).toEqual([
      'Готов вход',
      'Готовы проекты',
    ]);
  });

  it('версия без чекпоинтов имеет прогресс 0/0', () => {
    expect(versionProjection(version, [], [], AccessLevel.Metadata).progress).toEqual({
      done: 0,
      total: 0,
    });
  });
});

describe('выпущено, но не закрыто', () => {
  const released = { ...version, state: RoadmapVersionState.Released };

  it('считает незакрытые чекпоинты', () => {
    expect(versionProjection(version, checkpoints, [], AccessLevel.Metadata).unfinished).toBe(1);
  });

  it('у выпущенной версии с незакрытыми поднимает признак', () => {
    // Отказа нет: выпуск разрешён, расхождение лишь помечается.
    const projected = versionProjection(released, checkpoints, [], AccessLevel.Metadata);

    expect(projected.hasUnfinishedOnRelease).toBe(true);
  });

  it('у выпущенной версии без незакрытых признак снят', () => {
    const closed = checkpoints.map((checkpoint) => ({ ...checkpoint, isDone: true }));

    expect(
      versionProjection(released, closed, [], AccessLevel.Metadata).hasUnfinishedOnRelease,
    ).toBe(false);
  });

  it('у версии в работе незакрытые расхождением не считаются', () => {
    // Незакрытый чекпоинт в работе — это норма, а не расхождение.
    const projected = versionProjection(version, checkpoints, [], AccessLevel.Metadata);

    expect(projected.unfinished).toBe(1);
    expect(projected.hasUnfinishedOnRelease).toBe(false);
  });

  it('признак виден на уровне метаданных, а не только чтения', () => {
    // Публичная схема расширяет метаданные, и уровень «метаданные»
    // обязан видеть расхождение, не видя формулировок.
    const metadata = versionProjection(released, checkpoints, [], AccessLevel.Metadata);
    const read = versionProjection(released, checkpoints, [], AccessLevel.Read);

    expect(metadata.hasUnfinishedOnRelease).toBe(true);
    expect(read.hasUnfinishedOnRelease).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain('Готов вход');
  });

  it('версия без чекпоинтов расхождения не имеет', () => {
    const projected = versionProjection(released, [], [], AccessLevel.Metadata);

    expect(projected.unfinished).toBe(0);
    expect(projected.hasUnfinishedOnRelease).toBe(false);
  });
});

describe('ссылки на задачи в проекции', () => {
  it('отдаёт ссылку чекпоинта при уровне чтения', () => {
    const projected = versionProjection(
      version,
      checkpoints,
      [],
      AccessLevel.Read,
    ) as RoadmapVersionDetail;

    expect(projected.checkpoints[0]?.url).toBe('https://tracker.example.com/TASK-17');
  });

  it('не отдаёт ссылку, когда просили без ссылок', () => {
    const projected = versionProjection(
      version,
      checkpoints,
      [],
      AccessLevel.Read,
      { withLinks: false },
    ) as RoadmapVersionDetail;

    expect(projected.checkpoints[0]).not.toHaveProperty('url');
  });

  it('без ссылок формулировки остаются на месте', () => {
    const projected = versionProjection(
      version,
      checkpoints,
      [],
      AccessLevel.Read,
      { withLinks: false },
    ) as RoadmapVersionDetail;

    expect(projected.checkpoints.map((checkpoint) => checkpoint.title)).toEqual([
      'Готов вход',
      'Готовы проекты',
    ]);
  });
});

describe('выпуски и дата в проекции версии', () => {
  const released = (releasedDate: string | null, platformId = 'p1'): PlatformRelease => ({
    platformId,
    state: PlatformReleaseState.Released,
    releasedDate,
    buildLabel: null,
  });

  it('дата версии берётся из выпусков, когда они есть', () => {
    // Одна правда в каждый момент: хранимая дата остаётся ответом, пока
    // не появился ответ точнее.
    const projected = versionProjection(
      { ...version, releasedDate: '2026-01-01' },
      [],
      [released('2026-03-12'), released('2026-03-16', 'p2')],
      AccessLevel.Read,
    );

    expect(projected.releasedDate).toBe('2026-03-16');
  });

  it('не теряет хранимую дату, когда выпуски выпущены без дат', () => {
    // «Вышла, дата неизвестна» — допустимое состояние выпуска, и оно
    // не должно стирать то, что уже известно о версии.
    const projected = versionProjection(
      { ...version, releasedDate: '2026-01-01' },
      [],
      [released(null)],
      AccessLevel.Read,
    );

    expect(projected.releasedDate).toBe('2026-01-01');
  });

  it('без выпущенных выпусков дата остаётся хранимой', () => {
    const projected = versionProjection(
      { ...version, releasedDate: '2026-01-01' },
      [],
      [
        {
          platformId: 'p1',
          state: PlatformReleaseState.OnTest,
          releasedDate: null,
          buildLabel: null,
        },
      ],
      AccessLevel.Read,
    );

    expect(projected.releasedDate).toBe('2026-01-01');
  });

  it('дата из выпусков видна и на уровне метаданных', () => {
    // Публичная схема расширяет метаданные: положи вычисление в блок
    // чтения — и наружу уйдёт устаревшая хранимая дата.
    const projected = versionProjection(
      { ...version, releasedDate: '2026-01-01' },
      [],
      [released('2026-03-16')],
      AccessLevel.Metadata,
    );

    expect(projected.releasedDate).toBe('2026-03-16');
  });

  it('выпуски и теги открываются уровнем чтения', () => {
    const releases: PlatformRelease[] = [
      {
        platformId: 'p1',
        state: PlatformReleaseState.OnTest,
        releasedDate: null,
        buildLabel: null,
      },
    ];
    // Ключ карты — **задача**: теги принадлежат ей, и размещение их
    // только показывает. Карта по идентификатору размещения отдала бы
    // пустой набор — именно это и проверяет равенство ниже.
    const tags = new Map([[checkpoints[0]!.taskId, ['p1']]]);

    const metadata = versionProjection(version, checkpoints, releases, AccessLevel.Metadata);
    const read = versionProjection(version, checkpoints, releases, AccessLevel.Read, {
      platformsByCheckpoint: tags,
    }) as RoadmapVersionDetail;

    expect('releases' in metadata).toBe(false);
    expect(read.releases).toHaveLength(1);
    expect(read.checkpoints[0]?.platformIds).toEqual(['p1']);
  });

  it('чекпоинт без тегов получает пустой набор, а не отсутствие поля', () => {
    // Публичная схема строгая и поле ждёт; отсутствие провалило бы разбор.
    const read = versionProjection(
      version,
      checkpoints,
      [],
      AccessLevel.Read,
    ) as RoadmapVersionDetail;

    expect(read.checkpoints[0]?.platformIds).toEqual([]);
  });
});


it('отдаёт исполнителей только во внутренней проекции', () => {
  const rows = [{ ...checkpoints[0]!, details: {
    projectId: '7', assignees: [{ id: '1', name: 'Иван' }, { id: '2', name: 'Ольга' }],
    author: null, createdAt: null, startAt: null, dueAt: null, completedAt: null,
  } }, checkpoints[1]!];
  const internal = versionProjection(version, rows, [], AccessLevel.Read) as RoadmapVersionDetail;
  expect(internal.checkpoints.map((row) => row.assignees)).toEqual([['Иван', 'Ольга'], []]);
  const external = versionProjection(version, rows, [], AccessLevel.Read, { withLinks: false }) as RoadmapVersionDetail;
  for (const row of external.checkpoints) expect(row).not.toHaveProperty('assignees');
});
