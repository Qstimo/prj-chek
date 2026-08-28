import { AccessLevel, RoadmapVersionState, type RoadmapVersionDetail } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { versionProjection } from './roadmap.projection';
import type { RoadmapCheckpointRow, RoadmapVersionRow } from '../db/schema';

const version: RoadmapVersionRow = {
  id: '11111111-1111-1111-1111-111111111111',
  projectId: '22222222-2222-2222-2222-222222222222',
  label: 'v1.0',
  plannedDate: '2026-12-01',
  state: RoadmapVersionState.InProgress,
  position: 1,
  createdAt: new Date('2026-08-28T10:00:00Z'),
  updatedAt: new Date('2026-08-28T10:00:00Z'),
};

const checkpoints: RoadmapCheckpointRow[] = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    versionId: version.id,
    title: 'Готов вход',
    isDone: true,
    position: 1,
    createdAt: new Date('2026-08-28T10:00:00Z'),
    updatedAt: new Date('2026-08-28T10:00:00Z'),
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    versionId: version.id,
    title: 'Готовы проекты',
    isDone: false,
    position: 2,
    createdAt: new Date('2026-08-28T10:00:00Z'),
    updatedAt: new Date('2026-08-28T10:00:00Z'),
  },
];

describe('проекция версии', () => {
  it('на уровне метаданных отдаёт паспорт и прогресс без формулировок', () => {
    const projected = versionProjection(version, checkpoints, AccessLevel.Metadata);

    expect(projected).toEqual({
      id: version.id,
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: '2026-12-01',
      position: 1,
      progress: { done: 1, total: 2 },
    });
    expect(JSON.stringify(projected)).not.toContain('Готов вход');
  });

  it('на уровне чтения отдаёт чекпоинты по порядку', () => {
    const projected = versionProjection(
      version,
      checkpoints,
      AccessLevel.Read,
    ) as RoadmapVersionDetail;

    expect(projected.checkpoints.map((checkpoint) => checkpoint.title)).toEqual([
      'Готов вход',
      'Готовы проекты',
    ]);
  });

  it('версия без чекпоинтов имеет прогресс 0/0', () => {
    expect(versionProjection(version, [], AccessLevel.Metadata).progress).toEqual({
      done: 0,
      total: 0,
    });
  });
});
