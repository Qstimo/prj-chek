import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { StatusCheckCode } from '@cairn/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { checkHealth } from './health.checker';

/** Ответ без заголовков — так отвечает подделка в большинстве случаев. */
function answer(status: number, location: string | null = null) {
  return { status, headers: { get: (name: string) => (name === 'location' ? location : null) } };
}

/** Отказ `fetch`: обёртка `TypeError`, настоящий код — в причине. */
function fetchFailed(code: string, message: string): TypeError {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) });
}

describe('checkHealth', () => {
  it('собирает адрес из имени и пути', async () => {
    const fetchFn = vi.fn().mockResolvedValue(answer(200));

    await checkHealth('stage.example.com', '/api/health', fetchFn);

    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://stage.example.com/api/health');
  });

  it('без пути проверяет корень', async () => {
    const fetchFn = vi.fn().mockResolvedValue(answer(200));

    await checkHealth('stage.example.com', null, fetchFn);

    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://stage.example.com/');
  });

  it('считает 2xx живым и меряет задержку', async () => {
    const fetchFn = vi.fn().mockResolvedValue(answer(200));

    const result = await checkHealth('example.com', '/health', fetchFn);

    expect(result.health).toBe('up');
    expect(result.error).toBeNull();
    expect(result.code).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('редирект — живой адрес, и цель записывается', async () => {
    // 302 на чужое имя — рабочая настройка у одних и угнанная запись у
    // других: разобрать это можно, только увидев цель.
    const fetchFn = vi.fn().mockResolvedValue(answer(302, 'https://example.com/login'));

    const result = await checkHealth('example.com', null, fetchFn);

    expect(result.health).toBe('up');
    expect(result.code).toBe(StatusCheckCode.Redirect);
    expect(result.redirectTo).toBe('https://example.com/login');
    expect(result.error).toBeNull();
  });

  it('скрытый редирект (status 0) тоже считается ответом', async () => {
    // В браузере `redirect: 'manual'` даёт непрозрачный ответ со
    // `status === 0`, и правило «меньше 400 — жив» читало его как живой
    // по случайности. Теперь это названный случай: ответ есть, цель
    // неизвестна.
    const fetchFn = vi.fn().mockResolvedValue(answer(0));

    const result = await checkHealth('example.com', null, fetchFn);

    expect(result.health).toBe('up');
    expect(result.code).toBe(StatusCheckCode.Redirect);
    expect(result.redirectTo).toBeNull();
  });

  it('401 и 403 — отвечает, с пометкой «закрыто авторизацией»', async () => {
    // Падением это объявлять нельзя: адрес за авторизацией жив, а пуш
    // будил человека каждые четверть часа.
    for (const status of [401, 403]) {
      const result = await checkHealth('example.com', '/health', vi.fn().mockResolvedValue(answer(status)));

      expect(result.health).toBe('up');
      expect(result.code).toBe(StatusCheckCode.AuthRequired);
      expect(result.error).toBeNull();
    }
  });

  it('405 и 501 — отвечает, метод не разрешён', async () => {
    for (const status of [405, 501]) {
      const result = await checkHealth('example.com', null, vi.fn().mockResolvedValue(answer(status)));

      expect(result.health).toBe('up');
      expect(result.code).toBe(StatusCheckCode.MethodNotAllowed);
    }
  });

  it('404 — не падение, а неверно заданный путь', async () => {
    const result = await checkHealth('example.com', '/api/health', vi.fn().mockResolvedValue(answer(404)));

    expect(result.health).toBe('up');
    expect(result.code).toBe(StatusCheckCode.PathNotFound);
    // Фраза остаётся: о настройке говорит предупреждение, а не падение.
    expect(result.error).toContain('404');
  });

  it('прочий 4xx — тоже не падение', async () => {
    const result = await checkHealth('example.com', null, vi.fn().mockResolvedValue(answer(429)));

    expect(result.health).toBe('up');
    expect(result.code).toBe(StatusCheckCode.ClientError);
  });

  it('код 500 — не отвечает, с причиной и кодом', async () => {
    const result = await checkHealth('example.com', '/health', vi.fn().mockResolvedValue(answer(500)));

    expect(result.health).toBe('down');
    expect(result.code).toBe(StatusCheckCode.ServerError);
    expect(result.error).toContain('HTTP 500');
  });

  it('ответ сервера не перепроверяется по http', async () => {
    // Сервер ответил — пусть и отказом. Вторая попытка тут ничего не узнает.
    const fetchFn = vi.fn().mockResolvedValue(answer(500));

    await checkHealth('example.com', null, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('стенд без сертификата пробуется по http', async () => {
    // Он отвечает — звать его мёртвым неверно. О сертификате скажет
    // проверка TLS того же адреса.
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(
        fetchFailed('DEPTH_ZERO_SELF_SIGNED_CERT', 'self-signed certificate'),
      )
      .mockResolvedValueOnce(answer(200));

    const result = await checkHealth('stend.example.com', null, fetchFn);

    expect(result.health).toBe('up');
    expect(fetchFn.mock.calls[1]?.[0]).toBe('http://stend.example.com/');
  });

  it('когда не отвечает ни то ни другое, причина от https', async () => {
    // Спрашивали https — о нём и отвечаем: отказ http по тому же адресу
    // ничего нового не добавляет.
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(fetchFailed('ENOTFOUND', 'getaddrinfo ENOTFOUND нет.example.com'))
      .mockRejectedValueOnce(fetchFailed('ECONNREFUSED', 'connect ECONNREFUSED'));

    const result = await checkHealth('нет.example.com', null, fetchFn);

    expect(result.health).toBe('down');
    expect(result.code).toBe(StatusCheckCode.DnsNotFound);
    expect(result.error).toContain('ENOTFOUND');
  });

  it('причина отказа называет код, а не «fetch failed»', async () => {
    // `fetch` всегда бросает `TypeError: fetch failed`, а код лежит в
    // `cause`: пока брали сообщение обёртки, все отказы выглядели одинаково.
    const fetchFn = vi
      .fn()
      .mockRejectedValue(fetchFailed('ECONNREFUSED', 'connect ECONNREFUSED 203.0.113.10:443'));

    const result = await checkHealth('example.com', null, fetchFn);

    expect(result.code).toBe(StatusCheckCode.ConnectionRefused);
    expect(result.error).toBe('соединение отвергнуто (ECONNREFUSED)');
  });

  it('непроверяемый сертификат — падение с его кодом', async () => {
    // `fetch` отвергает такой сертификат на рукопожатии: адрес правда
    // недоступен клиентам, и молчать об этом нельзя. Срок же покажет
    // проверка TLS — она коннектится, не доверяя.
    const fetchFn = vi
      .fn()
      .mockRejectedValue(
        fetchFailed('UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'unable to verify the first certificate'),
      );

    const result = await checkHealth('example.com', null, fetchFn);

    expect(result.health).toBe('down');
    expect(result.code).toBe(StatusCheckCode.CertificateUntrusted);
  });
});

describe('checkHealth на настоящем fetch', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { Location: 'https://elsewhere.example.com/x' });
        response.end();

        return;
      }

      response.writeHead(request.url === '/closed' ? 401 : 200);
      response.end('ok');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => (cause ? reject(cause) : resolve())),
    );
  });

  it('в Node редирект виден кодом и заголовком, а не непрозрачным ответом', async () => {
    // Проверено настоящим `fetch`: в отличие от браузера, undici при
    // `redirect: 'manual'` отдаёт сам ответ — 302 и `Location`. Правило
    // «меньше 400 — жив» читало бы браузерный `status === 0` как живой
    // по случайности; здесь случайности нет.
    const result = await checkHealth(origin, '/redirect');

    expect(result.health).toBe('up');
    expect(result.code).toBe(StatusCheckCode.Redirect);
    expect(result.redirectTo).toBe('https://elsewhere.example.com/x');
  });

  it('адрес без https проверяется по http и живёт', async () => {
    const result = await checkHealth(origin, '/');

    expect(result.health).toBe('up');
    expect(result.code).toBeNull();
  });

  it('настоящий 401 не считается падением', async () => {
    const result = await checkHealth(origin, '/closed');

    expect(result.health).toBe('up');
    expect(result.code).toBe(StatusCheckCode.AuthRequired);
  });
});
