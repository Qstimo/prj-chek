import { createServer, type Server } from 'node:net';

import { StatusCheckCode } from '@cairn/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { checkPort, type ProbeSocket } from './port.checker';

/**
 * Сокет-подделка: отвечает заданным событием и больше ничем.
 *
 * Нужна для тишины и отказов по коду. Настоящей сетью их не проверить:
 * машина за туннелем или прокси принимает соединение за любой адрес сама —
 * проба до `198.51.100.1` (RFC 5737, маршрута нет ни у кого) на такой
 * машине «подключается». Это же ограничение названо у самой пробы.
 */
function socketThat(event: string, cause?: unknown): () => ProbeSocket {
  return () => {
    const listeners = new Map<string, (cause?: unknown) => void>();

    return {
      setTimeout: vi.fn(),
      destroy: vi.fn(),
      once(name: string, listener: (cause?: unknown) => void) {
        listeners.set(name, listener);

        if (name === event) {
          // Через микрозадачу: настоящий сокет не отвечает синхронно, и
          // проба не должна на это рассчитывать.
          void Promise.resolve().then(() => listener(cause));
        }

        return this;
      },
    };
  };
}

describe('checkPort', () => {
  let server: Server;
  let openPort: number;

  beforeAll(async () => {
    // Настоящий слушающий сокет: разница между «принял» и «отверг» живёт
    // в ядре, и подделкой её не проверишь.
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    openPort = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('открытый порт отвечает без кода', async () => {
    // `null` означает «принял соединение»: кода тут нет, потому что
    // рассказывать нечего.
    const probe = await checkPort('127.0.0.1', openPort);

    expect(probe).toMatchObject({ port: openPort, code: null });
    expect(probe.ms).toBeGreaterThanOrEqual(0);
  });

  it('закрытый порт отвечает отказом, а не тишиной', async () => {
    // Самая важная разница слепка: отказ означает, что путь до машины цел
    // и обратный пакет дошёл, — не слушает служба. Это к нам, а не к
    // провайдеру.
    const probe = await checkPort('127.0.0.1', openPort + 1);

    expect(probe.code).toBe(StatusCheckCode.ConnectionRefused);
  });

  it('тишина сокета — таймаут', async () => {
    const probe = await checkPort('198.51.100.1', 443, 150, socketThat('timeout'));

    expect(probe).toMatchObject({ port: 443, code: StatusCheckCode.Timeout });
  });

  it('код отказа разбирается той же картой, что остальные проверки', async () => {
    // Второй карты кодов быть не должно: `ENOTFOUND` здесь означает то
    // же, что в health и TLS.
    const probe = await checkPort(
      'нет-такого-имени.invalid',
      443,
      150,
      socketThat('error', Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })),
    );

    expect(probe.code).toBe(StatusCheckCode.DnsNotFound);
  });

  it('предел ожидания доезжает до сокета', async () => {
    const setTimeout = vi.fn();
    const probe = await checkPort('198.51.100.1', 443, 250, () => ({
      setTimeout,
      destroy: vi.fn(),
      once(name: string, listener: (cause?: unknown) => void) {
        if (name === 'timeout') {
          void Promise.resolve().then(() => listener());
        }

        return this;
      },
    }));

    expect(setTimeout).toHaveBeenCalledWith(250);
    expect(probe.code).toBe(StatusCheckCode.Timeout);
  });
});
