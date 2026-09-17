import { describe, expect, it, vi } from 'vitest';

import { checkHealth } from './health.checker';

describe('checkHealth', () => {
  it('собирает адрес из имени и пути', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 200 });

    await checkHealth('stage.example.com', '/api/health', fetchFn);

    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://stage.example.com/api/health');
  });

  it('без пути проверяет корень', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 200 });

    await checkHealth('stage.example.com', null, fetchFn);

    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://stage.example.com/');
  });

  it('считает 2xx живым и меряет задержку', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 200 });

    const result = await checkHealth('example.com', '/health', fetchFn);

    expect(result.health).toBe('up');
    expect(result.error).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('редирект тоже считается живым', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 307 });

    expect((await checkHealth('example.com', null, fetchFn)).health).toBe('up');
  });

  it('код 500 — не отвечает, с причиной', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 500 });

    const result = await checkHealth('example.com', '/health', fetchFn);

    expect(result.health).toBe('down');
    expect(result.error).toBe('HTTP 500');
  });

  it('ответ сервера не перепроверяется по http', async () => {
    // Сервер ответил — пусть и отказом. Вторая попытка тут ничего не узнает.
    const fetchFn = vi.fn().mockResolvedValue({ status: 500 });

    await checkHealth('example.com', null, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('стенд без сертификата пробуется по http', async () => {
    // Он отвечает — звать его мёртвым неверно. Об отсутствии сертификата
    // скажет проверка TLS того же адреса.
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ status: 200 });

    const result = await checkHealth('stend.example.com', null, fetchFn);

    expect(result.health).toBe('up');
    expect(fetchFn.mock.calls[1]?.[0]).toBe('http://stend.example.com/');
  });

  it('когда не отвечает ни то ни другое, причина от https', async () => {
    // Спрашивали https — о нём и отвечаем: отказ http по тому же адресу
    // ничего нового не добавляет.
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('getaddrinfo ENOTFOUND'))
      .mockRejectedValueOnce(new TypeError('ECONNREFUSED'));

    const result = await checkHealth('нет.example.com', null, fetchFn);

    expect(result.health).toBe('down');
    expect(result.error).toContain('ENOTFOUND');
  });
});
