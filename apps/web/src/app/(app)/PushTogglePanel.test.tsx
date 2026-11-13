import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';
import * as utils from '@/components/PushToggle/utils';

import { PushTogglePanel } from './PushTogglePanel';

vi.mock('@/api/hooks');
vi.mock('@/components/PushToggle/utils');

const DEVICE = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  p256dh: 'ключ',
  auth: 'секрет',
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Мутация с заданным поведением вызова. */
function mutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutate: vi.fn(), mutateAsync, isPending: false, error: null } as never;
}

beforeEach(() => {
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  });

  vi.mocked(utils.isPushSupported).mockReturnValue(true);
  vi.mocked(utils.subscribeDevice).mockResolvedValue(DEVICE);
  vi.mocked(utils.dropDeviceSubscription).mockResolvedValue(undefined);
  vi.mocked(hooks.useQueryPushKey).mockReturnValue(query({ publicKey: 'публичный-ключ' }));
  vi.mocked(hooks.useMutationPushSubscribe).mockReturnValue(mutation(vi.fn()));
  vi.mocked(hooks.useMutationPushUnsubscribe).mockReturnValue(mutation(vi.fn()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PushTogglePanel', () => {
  it('без подписки в браузере сервер не спрашивается', async () => {
    const check = vi.fn();

    vi.mocked(utils.deviceEndpointOf).mockResolvedValue(null);
    vi.mocked(hooks.useMutationPushCheck).mockReturnValue(mutation(check));

    render(<PushTogglePanel />);

    expect(
      await screen.findByRole('button', { name: 'Уведомлять на этом устройстве' }),
    ).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
  });

  it('подписка числится за субъектом — кнопка предлагает выключить', async () => {
    vi.mocked(utils.deviceEndpointOf).mockResolvedValue(DEVICE.endpoint);
    vi.mocked(hooks.useMutationPushCheck).mockReturnValue(
      mutation(vi.fn().mockResolvedValue({ isMine: true })),
    );

    render(<PushTogglePanel />);

    expect(
      await screen.findByRole('button', { name: 'Уведомления включены · выключить' }),
    ).toBeInTheDocument();
  });

  it('подписка в браузере есть, а на сервере её нет — кнопка показывает «выключено»', async () => {
    // Ровно след неудавшегося запроса: `pushManager` подписку создал,
    // сервер строки не завёл. Поверив браузеру, кнопка соврала бы.
    vi.mocked(utils.deviceEndpointOf).mockResolvedValue(DEVICE.endpoint);
    vi.mocked(hooks.useMutationPushCheck).mockReturnValue(
      mutation(vi.fn().mockResolvedValue({ isMine: false })),
    );

    render(<PushTogglePanel />);

    expect(
      await screen.findByRole('button', { name: 'Уведомлять на этом устройстве' }),
    ).toBeInTheDocument();
  });

  it('отказ сервера снимает подписку в браузере и показывает ошибку', async () => {
    vi.mocked(utils.deviceEndpointOf).mockResolvedValue(null);
    vi.mocked(hooks.useMutationPushCheck).mockReturnValue(mutation(vi.fn()));
    vi.mocked(hooks.useMutationPushSubscribe).mockReturnValue(
      mutation(vi.fn().mockRejectedValue(new Error('Этот адрес подписки принадлежит другому'))),
    );

    render(<PushTogglePanel />);
    (await screen.findByRole('button', { name: 'Уведомлять на этом устройстве' })).click();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Этот адрес подписки принадлежит другому',
      );
    });

    // Снятие зовётся дважды: перед попыткой и при её провале. Важно, что
    // после отказа браузерной подписки не остаётся.
    expect(utils.dropDeviceSubscription).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', { name: 'Уведомлять на этом устройстве' }),
    ).toBeInTheDocument();
  });
});
