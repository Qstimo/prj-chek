import { describe, expect, it } from 'vitest';
import { dailyDowntime } from './timeline';

describe('daily incident intersections', () => {
  it('clips old and open incidents to each day and merges overlapping intervals', () => {
    const window = { days: 2, from: '2026-11-01T00:00:00Z', to: '2026-11-03T00:00:00Z' };
    const incident = (id: string, startedAt: string, resolvedAt: string | null) => ({ id, domainId: 'a', startedAt, resolvedAt, cause: null, lastCause: null, lastDownAt: resolvedAt, checks: 1 });
    expect(dailyDowntime(window, [
      incident('old', '2026-10-31T23:00:00Z', '2026-11-01T01:00:00Z'),
      incident('overlap', '2026-11-01T00:30:00Z', '2026-11-01T02:00:00Z'),
      incident('open', '2026-11-02T23:00:00Z', null),
      incident('outside', '2026-11-03T00:00:00Z', null),
    ]).map((day) => day.seconds)).toEqual([7200, 3600]);
  });
  it('keeps zero recorded downtime distinct from a measured uptime percentage', () => {
    expect(dailyDowntime({ days: 1, from: '2026-11-01T12:00:00Z', to: '2026-11-02T12:00:00Z' }, []).map((day) => day.seconds)).toEqual([0, 0]);
  });
});
