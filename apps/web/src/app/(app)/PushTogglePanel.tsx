'use client';

import { useEffect, useState } from 'react';

import { useMutationPushSubscribe, useMutationPushUnsubscribe, useQueryPushKey } from '@/api/hooks';
import { PushToggle } from '@/components/PushToggle';
import {
  deviceEndpointOf,
  dropDeviceSubscription,
  hasDeviceSubscription,
  isPushSupported,
  subscribeDevice,
} from '@/components/PushToggle/utils';

/** Что сказать, когда причина отказа неизвестна. */
const FAILURE_TEXT = 'Не удалось включить уведомления';

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
  const [error, setError] = useState<string | null>(null);

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

  /** Сервер узнаёт об отписке раньше браузера: иначе повторить нечем. */
  async function disable(): Promise<void> {
    const endpoint = await deviceEndpointOf();

    if (endpoint) {
      await unsubscribe.mutateAsync(endpoint);
    }

    await dropDeviceSubscription();
    setIsSubscribed(false);
  }

  /**
   * Зовёт действие и показывает отказ.
   *
   * Без этого `void enable()` глотал любое исключение: кнопка молча
   * возвращалась в исходное состояние, а человек не знал, почему
   * уведомления не включились.
   */
  function attempt(action: () => Promise<void>): void {
    setError(null);
    void action().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : FAILURE_TEXT);
    });
  }

  return (
    <PushToggle
      publicKey={publicKey}
      permission={permission}
      isSubscribed={isSubscribed}
      isSupported={isPushSupported()}
      isBusy={subscribe.isPending || unsubscribe.isPending}
      error={error}
      onSubscribe={() => attempt(enable)}
      onUnsubscribe={() => attempt(disable)}
    />
  );
}
