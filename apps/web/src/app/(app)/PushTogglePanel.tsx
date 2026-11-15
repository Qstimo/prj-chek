'use client';

import { useEffect, useState } from 'react';

import {
  useMutationPushCheck,
  useMutationPushSubscribe,
  useMutationPushUnsubscribe,
  useQueryPushKey,
} from '@/api/hooks';
import { PushToggle } from '@/components/PushToggle';
import {
  deviceEndpointOf,
  dropDeviceSubscription,
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
  const check = useMutationPushCheck();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [error, setError] = useState<string | null>(null);

  const checkMine = check.mutateAsync;

  /**
   * Состояние кнопки спрашивается у сервера, а не у браузера.
   *
   * Браузерная подписка переживает неудавшийся `POST`: сеть моргнула,
   * сервер ответил отказом — а `pushManager` подписку уже создал. Поверив
   * браузеру, кнопка навсегда показывала бы «включено» человеку, строки
   * которого в базе нет и которому ни одно падение не придёт.
   */
  useEffect(() => {
    if (!isPushSupported()) {
      return;
    }

    setPermission(Notification.permission);

    void (async () => {
      const endpoint = await deviceEndpointOf();

      if (!endpoint) {
        setIsSubscribed(false);

        return;
      }

      const { isMine } = await checkMine(endpoint);

      setIsSubscribed(isMine);
    })();
  }, [checkMine]);

  const publicKey = key.data?.publicKey ?? null;

  async function enable(): Promise<void> {
    const granted = await Notification.requestPermission();

    setPermission(granted);

    if (granted !== 'granted' || !publicKey) {
      return;
    }

    // Подписка, оставшаяся от неудавшейся попытки или от прежнего хозяина
    // профиля, снимается до новой: `pushManager.subscribe` с тем же ключом
    // вернул бы тот же адрес, а сервер отвергает чужой адрес отказом.
    await dropDeviceSubscription();

    const device = await subscribeDevice(publicKey);

    try {
      await subscribe.mutateAsync(device);
    } catch (cause) {
      // Сервер подписку не принял — в браузере её тоже быть не должно,
      // иначе после перезагрузки кнопка соврёт «включено».
      await dropDeviceSubscription();

      throw cause;
    }

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
