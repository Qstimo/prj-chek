import { RoadmapVersionState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { isDetailed } from './utils';

const metadata = {
  id: '1',
  label: 'v1.0',
  state: RoadmapVersionState.Planned,
  plannedDate: null,
  releasedDate: null,
  position: 1,
  progress: { done: 0, total: 0 },
};

describe('isDetailed', () => {
  it('различает проекции по наличию чекпоинтов', () => {
    expect(isDetailed(metadata)).toBe(false);
    expect(isDetailed({ ...metadata, checkpoints: [] })).toBe(true);
  });
});
