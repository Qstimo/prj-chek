import { RoadmapVersionState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { dateLabelOf } from './utils';

const base = {
  id: '1',
  label: 'v1.0',
  plannedDate: null,
  releasedDate: null,
  progress: { done: 0, total: 0 },
};

describe('dateLabelOf', () => {
  it('выпущенная с датой — сама дата', () => {
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Released, releasedDate: '2026-06-15' }),
    ).toBe('15.06.2026');
  });

  it('выпущенная без даты — пусто, даже при плановой', () => {
    // После миграции у старых релизов даты нет; плановая с «ожидается» была бы ложью.
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Released, plannedDate: '2026-06-01' }),
    ).toBe('');
  });

  it('не выпущенная с плановой — «ожидается»', () => {
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Planned, plannedDate: '2026-12-01' }),
    ).toBe('ожидается 01.12.2026');
  });

  it('без дат — пусто', () => {
    expect(dateLabelOf({ ...base, state: RoadmapVersionState.InProgress })).toBe('');
  });
});
