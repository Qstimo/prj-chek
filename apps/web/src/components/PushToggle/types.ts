/** Пропсы кнопки подписки на уведомления. */
export interface IProps {
  /** Публичный VAPID-ключ; `null` — уведомления выключены на сервере. */
  publicKey: string | null;
  /** Разрешение браузера на уведомления. */
  permission: NotificationPermission;
  /** Подписано ли это устройство. */
  isSubscribed: boolean;
  /** Есть ли в браузере Push API. По умолчанию — есть. */
  isSupported?: boolean;
  /** Запрос в пути: повторное нажатие бессмысленно. */
  isBusy?: boolean;
  onSubscribe?: () => void;
  onUnsubscribe?: () => void;
}
