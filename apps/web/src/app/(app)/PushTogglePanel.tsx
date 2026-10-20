'use client';

import { useEffect, useState } from 'react';

import { useMutationPushSubscribe, useMutationPushUnsubscribe, useQueryPushKey } from '@/api/hooks';
import { PushToggle } from '@/components/PushToggle';
import {
  hasDeviceSubscription,
  isPushSupported,
  subscribeDevice,
  unsubscribeDevice,
} from '@/components/PushToggle/utils';

/**
 * Подписка этого устройства на уведомления о падениях.
 *
 * Контейнер клиентский: он один и трогает браузер — `navigator`,
 * `Notification.permission`, `pushManager`, — а сводка остаётся серверным
 * компонентом.
 */
export function PushTogglePanel() {
  const key = useQueryPushKey();
  const subscribe = useMutationPushSubscribe();
  const unsubscribe = useMutationPushUnsubscribe();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (!isPushSupported()) {
      return;
    }

    setPermission(Notification.permission);
    void hasDeviceSubscription().then(setIsSubscribed);
  }, []);

  const publicKey = key.data?.publicKey ?? null;

  async function enable(): Promise<void> {
    const granted = await Notification.requestPermission();

    setPermission(granted);

    if (granted !== 'granted' || !publicKey) {
      return;
    }

    await subscribe.mutateAsync(await subscribeDevice(publicKey));
    setIsSubscribed(true);
  }

  async function disable(): Promise<void> {
    const endpoint = await unsubscribeDevice();

    if (endpoint) {
      await unsubscribe.mutateAsync(endpoint);
    }

    setIsSubscribed(false);
  }

  return (
    <PushToggle
      publicKey={publicKey}
      permission={permission}
      isSubscribed={isSubscribed}
      isSupported={isPushSupported()}
      isBusy={subscribe.isPending || unsubscribe.isPending}
      onSubscribe={() => void enable()}
      onUnsubscribe={() => void disable()}
    />
  );
}
