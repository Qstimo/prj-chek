import { describe, expect, it } from 'vitest';

import { pushKeySchema, pushSubscribeSchema, pushUnsubscribeSchema } from './push';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

describe('схема подписки на пуши', () => {
  it('принимает то, что отдаёт браузер', () => {
    const parsed = pushSubscribeSchema.parse({
      endpoint: ENDPOINT,
      p256dh: 'BFx…ключ',
      auth: 'секрет',
    });

    expect(parsed.endpoint).toBe(ENDPOINT);
  });

  it('отвергает адрес, который не адрес', () => {
    expect(() =>
      pushSubscribeSchema.parse({ endpoint: 'не адрес', p256dh: 'к', auth: 'с' }),
    ).toThrow();
  });

  it('отвергает подписку без ключей: шифровать будет нечем', () => {
    expect(() => pushSubscribeSchema.parse({ endpoint: ENDPOINT, p256dh: '', auth: '' })).toThrow();
  });

  it('снятие подписки опознаёт устройство адресом', () => {
    expect(pushUnsubscribeSchema.parse({ endpoint: ENDPOINT })).toEqual({ endpoint: ENDPOINT });
  });

  it('выключенные уведомления отдают пустой ключ', () => {
    expect(pushKeySchema.parse({ publicKey: null }).publicKey).toBeNull();
  });
});
