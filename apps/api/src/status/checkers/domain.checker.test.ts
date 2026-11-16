import { StatusCheckCode } from '@cairn/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RDAP_CACHE_ENV, checkDomainExpiry, clearDomainExpiryCache } from './domain.checker';

/** Ответ реестра со сроком регистрации. */
function registry(expiration: string) {
  return {
    status: 200,
    json: async () => ({
      events: [
        { eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' },
        { eventAction: 'expiration', eventDate: expiration },
      ],
    }),
  };
}

describe('checkDomainExpiry', () => {
  beforeEach(() => {
    clearDomainExpiryCache();
    // Кэш проверяется отдельными тестами: здесь он только мешал бы.
    process.env[RDAP_CACHE_ENV] = '0';
  });

  afterEach(() => {
    delete process.env[RDAP_CACHE_ENV];
  });

  it('берёт срок регистрации из события expiration', async () => {
    const fetchFn = vi.fn().mockResolvedValue(registry('2026-09-20T00:00:00Z'));

    const result = await checkDomainExpiry('example.com', { fetchFn });

    expect(result.expiresAt?.toISOString()).toBe('2026-09-20T00:00:00.000Z');
    expect(result.error).toBeNull();
    expect(result.code).toBeNull();
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://rdap.org/domain/example.com');
  });

  it('спрашивает реестр о том имени, которое дали — о корне', async () => {
    // Реестры знают только корни: пока спрашивали по имени адреса, то
    // есть по поддомену, у каждого адреса висело вечное «реестр ответил
    // HTTP 404». Корень выбирает вызывающий — у него он есть в базе.
    const fetchFn = vi.fn().mockResolvedValue(registry('2027-01-01T00:00:00Z'));

    await checkDomainExpiry('example.com', { fetchFn });

    expect(fetchFn.mock.calls[0]?.[0]).not.toContain('stage.');
  });

  it('незнакомый реестру домен — свой код', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 404, json: async () => ({}) });

    const result = await checkDomainExpiry('example.zone', { fetchFn });

    expect(result.expiresAt).toBeNull();
    expect(result.code).toBe(StatusCheckCode.RegistryNotFound);
    expect(result.error).toContain('404');
  });

  it('отказ реестра отличается от незнакомого домена', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 503, json: async () => ({}) });

    expect((await checkDomainExpiry('example.com', { fetchFn })).code).toBe(
      StatusCheckCode.RegistryUnavailable,
    );
  });

  it('ответ без события expiration — свой код', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ events: [{ eventAction: 'registration', eventDate: '2020-01-01' }] }),
    });

    const result = await checkDomainExpiry('example.com', { fetchFn });

    expect(result.code).toBe(StatusCheckCode.RegistryNoExpiration);
  });

  it('сетевая ошибка разбирается до кода', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('getaddrinfo ENOTFOUND rdap.org'), {
            code: 'ENOTFOUND',
          }),
        }),
      );

    const result = await checkDomainExpiry('example.com', { fetchFn });

    expect(result.code).toBe(StatusCheckCode.DnsNotFound);
    expect(result.error).toContain('ENOTFOUND');
  });

  it('негодная дата в ответе не выдаёт себя за срок', async () => {
    const fetchFn = vi.fn().mockResolvedValue(registry('когда-нибудь'));

    const result = await checkDomainExpiry('example.com', { fetchFn });

    expect(result.expiresAt).toBeNull();
    expect(result.code).toBe(StatusCheckCode.RegistryNoExpiration);
  });
});

describe('кэш ответов реестра', () => {
  beforeEach(() => {
    clearDomainExpiryCache();
    delete process.env[RDAP_CACHE_ENV];
  });

  it('второй вопрос о том же корне в реестр не уходит', async () => {
    // Срок меняется раз в год, а прогон идёт каждые четверть часа и по
    // каждому адресу: без кэша реестр получал бы сотни одинаковых
    // вопросов в сутки.
    const fetchFn = vi.fn().mockResolvedValue(registry('2027-01-01T00:00:00Z'));

    const first = await checkDomainExpiry('example.com', { fetchFn });
    const second = await checkDomainExpiry('example.com', { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(second.expiresAt?.toISOString()).toBe(first.expiresAt?.toISOString());
  });

  it('разные корни кэшируются по отдельности', async () => {
    const fetchFn = vi.fn().mockResolvedValue(registry('2027-01-01T00:00:00Z'));

    await checkDomainExpiry('example.com', { fetchFn });
    await checkDomainExpiry('example.org', { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('отказ тоже кэшируется: зона без RDAP отказывает устойчиво', async () => {
    // Иначе закрытая дверь получала бы 96 стуков в сутки — ровно то, от
    // чего кэш и заводился.
    const fetchFn = vi.fn().mockResolvedValue({ status: 404, json: async () => ({}) });

    await checkDomainExpiry('example.zone', { fetchFn });
    await checkDomainExpiry('example.zone', { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('по истечении срока кэша вопрос задаётся снова', async () => {
    const fetchFn = vi.fn().mockResolvedValue(registry('2027-01-01T00:00:00Z'));
    let now = 1_000_000;

    process.env[RDAP_CACHE_ENV] = '24';
    await checkDomainExpiry('example.com', { fetchFn, now: () => now });

    now += 23 * 60 * 60 * 1000;
    await checkDomainExpiry('example.com', { fetchFn, now: () => now });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    now += 2 * 60 * 60 * 1000;
    await checkDomainExpiry('example.com', { fetchFn, now: () => now });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
