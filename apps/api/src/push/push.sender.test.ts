import { describe, expect, it, vi } from 'vitest';

import { PushSender, SendOutcome, type PushTransport } from './push.sender';

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
