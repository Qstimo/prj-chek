import { afterEach, describe, expect, it, vi } from 'vitest';

import { applicationServerKeyOf, subscribeDevice } from './utils';

describe('преобразование ключа VAPID', () => {
  it('переводит base64url в байты', () => {
    // 'AQID' — это 0x01 0x02 0x03 в обычном base64.
    expect([...applicationServerKeyOf('AQID')]).toEqual([1, 2, 3]);
  });

  it('понимает алфавит base64url без выравнивания', () => {
    // Браузер требует именно байты, а ключ приходит в base64url: символы
    // «-» и «_» вместо «+» и «/», и без хвостовых «=».
    const withUrlAlphabet = applicationServerKeyOf('-_8');
    const withStandard = applicationServerKeyOf('+/8=');

    expect([...withUrlAlphabet]).toEqual([...withStandard]);
  });

  it('отдаёт ровно столько байт, сколько в ключе', () => {
    expect(applicationServerKeyOf('AQIDBAUGBwgJCgsMDQ4PEA').length).toBe(16);
  });
});

describe('подписка устройства', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Подписка в том виде, в каком её отдаёт браузер. */
  function subscriptionStub(endpoint: string) {
    return {
      endpoint,
      toJSON: () => ({ keys: { p256dh: 'ключ', auth: 'секрет' } }),
    };
  }

  /**
   * Первое нажатие на незнакомом устройстве.
   *
   * `register` отдаёт регистрацию до активации worker, и подписка на ней
   * падает ровно так, как в Chrome: «Subscription failed - no active
   * Service Worker». Человек видел английскую ошибку и включал
   * уведомления со второго нажатия.
   */
  it('ждёт активации worker, а не подписывается сразу после регистрации', async () => {
    const installing = {
      pushManager: {
        subscribe: vi.fn(async () => {
          throw new Error('Subscription failed - no active Service Worker');
        }),
      },
    };
    const active = {
      pushManager: { subscribe: vi.fn(async () => subscriptionStub('https://push.example/1')) },
    };

    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: vi.fn(async () => installing),
        ready: Promise.resolve(active),
      },
    });

    await expect(subscribeDevice('AQID')).resolves.toEqual({
      endpoint: 'https://push.example/1',
      p256dh: 'ключ',
      auth: 'секрет',
    });
    expect(installing.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('регистрирует worker перед подпиской', async () => {
    const register = vi.fn(async () => ({}));
    const active = {
      pushManager: { subscribe: vi.fn(async () => subscriptionStub('https://push.example/2')) },
    };

    vi.stubGlobal('navigator', {
      serviceWorker: { register, ready: Promise.resolve(active) },
    });

    await subscribeDevice('AQID');

    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(active.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
  });
});
