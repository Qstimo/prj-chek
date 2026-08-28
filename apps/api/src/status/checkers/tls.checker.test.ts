import { describe, expect, it, vi } from 'vitest';

import { checkTls } from './tls.checker';

describe('checkTls', () => {
  it('возвращает срок действия сертификата', async () => {
    const connectFn = vi.fn().mockResolvedValue(new Date('2026-12-01T00:00:00Z'));

    const result = await checkTls('example.com', connectFn);

    expect(result.validTo?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(result.error).toBeNull();
    expect(connectFn).toHaveBeenCalledWith('example.com');
  });

  it('ошибка соединения попадает в результат', async () => {
    const connectFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await checkTls('example.com', connectFn);

    expect(result.validTo).toBeNull();
    expect(result.error).toContain('ECONNREFUSED');
  });
});
