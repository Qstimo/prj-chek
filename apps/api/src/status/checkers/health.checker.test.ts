import { describe, expect, it, vi } from 'vitest';

import { checkHealth } from './health.checker';

describe('checkHealth', () => {
  it('считает 2xx живым и меряет задержку', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 200 });

    const result = await checkHealth('https://example.com/health', fetchFn);

    expect(result.health).toBe('up');
    expect(result.error).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('редирект тоже считается живым', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 307 });

    expect((await checkHealth('https://example.com', fetchFn)).health).toBe('up');
  });

  it('код 500 — не отвечает, с причиной', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 500 });

    const result = await checkHealth('https://example.com/health', fetchFn);

    expect(result.health).toBe('down');
    expect(result.error).toBe('HTTP 500');
  });

  it('сетевая ошибка — не отвечает, с сообщением', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    const result = await checkHealth('https://example.com/health', fetchFn);

    expect(result.health).toBe('down');
    expect(result.error).toContain('fetch failed');
  });
});
