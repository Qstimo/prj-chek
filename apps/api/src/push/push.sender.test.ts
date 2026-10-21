import { describe, expect, it, vi } from 'vitest';

import { PushSender, realTransport, SendOutcome, type PushTransport } from './push.sender';

const SUBSCRIPTION = { id: 'п1', endpoint: 'https://push/1', p256dh: 'к', auth: 'с' };

/** Отказ push-службы с кодом, как его отдаёт web-push. */
function failure(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`отказ ${statusCode}`), { statusCode });
}

describe('отправитель пушей', () => {
  it('доставленная нагрузка — доставлена', async () => {
    const transport: PushTransport = vi.fn().mockResolvedValue(undefined);

    expect(await new PushSender(transport).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Delivered);
  });

  it('передаёт ключи подписки транспорту', async () => {
    const transport: PushTransport = vi.fn().mockResolvedValue(undefined);

    await new PushSender(transport).send(SUBSCRIPTION, '{"a":1}');

    expect(transport).toHaveBeenCalledWith(
      { endpoint: 'https://push/1', keys: { p256dh: 'к', auth: 'с' } },
      '{"a":1}',
    );
  });

  it('404 и 410 означают мёртвую подписку', async () => {
    for (const code of [404, 410]) {
      const transport: PushTransport = vi.fn().mockRejectedValue(failure(code));

      expect(await new PushSender(transport).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Gone);
    }
  });

  it('прочий отказ подписку не убивает', async () => {
    // 429 и 5xx — беда службы, а не устройства: удалить подписку
    // значило бы потерять адресата из-за чужой перегрузки.
    const transport: PushTransport = vi.fn().mockRejectedValue(failure(503));

    expect(await new PushSender(transport).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Failed);
  });

  it('отказ без кода — тоже просто отказ', async () => {
    const transport: PushTransport = vi.fn().mockRejectedValue(new Error('сеть'));

    expect(await new PushSender(transport).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Failed);
  });

  it('выключенные уведомления не отправляют ничего', async () => {
    expect(await new PushSender(null).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Disabled);
  });
});

describe('сборка боевого транспорта', () => {
  /** Ставит переменные VAPID на время вызова и возвращает прежние. */
  function withVapid<T>(values: Record<string, string | undefined>, body: () => T): T {
    const names = ['CAIRN_VAPID_PUBLIC_KEY', 'CAIRN_VAPID_PRIVATE_KEY', 'CAIRN_VAPID_SUBJECT'];
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));

    const apply = (source: Record<string, string | undefined>) => {
      for (const name of names) {
        if (source[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = source[name];
        }
      }
    };

    apply(values);

    try {
      return body();
    } finally {
      apply(saved);
    }
  }

  /** Пара, которую библиотека принимает: нужной длины и в base64url. */
  const VALID = {
    CAIRN_VAPID_PUBLIC_KEY:
      'BEcbLe_M4BcEmw-RBvTMONGGUgkznH0SoUCXKlOvTaIKsGJ-0cmXUqk2ML0r8dk7OOROg4V9BBU7gXCbJXNPTT4',
    CAIRN_VAPID_PRIVATE_KEY: 'Nh-Pa0HY51NjdUz4jPxLbNlERnraMsOlvYiX_MBxK6U',
  };

  it('без ключей транспорта нет', () => {
    expect(withVapid({}, realTransport)).toBeNull();
  });

  it('с полным набором транспорт собирается', () => {
    expect(
      withVapid({ ...VALID, CAIRN_VAPID_SUBJECT: 'mailto:admin@example.com' }, realTransport),
    ).not.toBeNull();
  });

  it('кривой subject выключает уведомления, а не валит приложение', () => {
    // Фабрика работает при инициализации Nest: брошенное здесь исключение
    // уводит контейнер API в перезапуск по кругу — из-за необязательной
    // функции падает весь реестр.
    expect(
      withVapid({ ...VALID, CAIRN_VAPID_SUBJECT: 'admin@example.com' }, realTransport),
    ).toBeNull();
  });

  it('кривой ключ тоже выключает, а не валит', () => {
    expect(
      withVapid(
        {
          CAIRN_VAPID_PUBLIC_KEY: 'слишком-короткий',
          CAIRN_VAPID_PRIVATE_KEY: 'тоже',
          CAIRN_VAPID_SUBJECT: 'mailto:admin@example.com',
        },
        realTransport,
      ),
    ).toBeNull();
  });
});
