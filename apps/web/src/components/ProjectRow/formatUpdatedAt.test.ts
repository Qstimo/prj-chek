import { describe, expect, it } from 'vitest';

import { formatUpdatedAt } from './formatUpdatedAt';

describe('formatUpdatedAt', () => {
  it('для null показывает тире', () => {
    expect(formatUpdatedAt(null)).toBe('—');
  });

  it('форматирует ISO по-русски', () => {
    expect(formatUpdatedAt('2026-10-01T12:00:00.000Z')).toMatch(/2026/);
  });
});
