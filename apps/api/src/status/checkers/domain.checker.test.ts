import { describe, expect, it, vi } from 'vitest';

import { checkDomainExpiry } from './domain.checker';

describe('checkDomainExpiry', () => {
  it('берёт срок регистрации из события expiration', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        events: [
          { eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' },
          { eventAction: 'expiration', eventDate: '2026-09-20T00:00:00Z' },
        ],
      }),
    });

    const result = await checkDomainExpiry('example.com', fetchFn);

    expect(result.expiresAt?.toISOString()).toBe('2026-09-20T00:00:00.000Z');
    expect(result.error).toBeNull();
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://rdap.org/domain/example.com');
  });

  it('зона без RDAP — ошибка с кодом', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 404, json: async () => ({}) });

    const result = await checkDomainExpiry('example.zone', fetchFn);

    expect(result.expiresAt).toBeNull();
    expect(result.error).toContain('404');
  });

  it('ответ без события expiration — ошибка', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ events: [{ eventAction: 'registration', eventDate: '2020-01-01' }] }),
    });

    const result = await checkDomainExpiry('example.com', fetchFn);

    expect(result.error).toContain('expiration');
  });

  it('сетевая ошибка попадает в результат', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('сеть недоступна'));

    const result = await checkDomainExpiry('example.com', fetchFn);

    expect(result.error).toContain('сеть недоступна');
  });
});
