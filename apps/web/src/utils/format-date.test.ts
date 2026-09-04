import { describe, expect, it } from 'vitest';

import { formatDate } from './format-date';

describe('formatDate', () => {
  it('день ГГГГ-ММ-ДД в русском формате', () => {
    expect(formatDate('2026-12-01')).toBe('01.12.2026');
  });
});
