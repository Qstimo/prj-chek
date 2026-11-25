import { describe, expect, it } from 'vitest';
import type { ProjectTracker } from '@cairn/shared';
import { hasProjectTrackerConnection } from './trackerConnection';

describe('доступность настроек Weeek у проекта', () => {
  const tracker = (blockedBy: string | null, hasConnection?: boolean): ProjectTracker => ({
    blockedBy,
    isOperational: blockedBy === null,
    binding: null,
    ...(hasConnection === undefined ? {} : { hasConnection }),
  });
  it('без токена и при загрузке не показывает настройки, даже если адрес был сохранён', () => {
    expect(hasProjectTrackerConnection(undefined)).toBe(false);
    expect(hasProjectTrackerConnection(tracker('base_url_missing'))).toBe(false);
    expect(hasProjectTrackerConnection(tracker('secret_missing'))).toBe(false);
    expect(hasProjectTrackerConnection(tracker(null, false))).toBe(false);
  });
  it('с сохранённым токеном показывает настройки, в том числе при выключенном подключении', () => {
    expect(hasProjectTrackerConnection(tracker(null, true))).toBe(true);
    expect(hasProjectTrackerConnection(tracker('disabled', true))).toBe(true);
    expect(hasProjectTrackerConnection(tracker('secret_undecryptable', true))).toBe(true);
  });
});
