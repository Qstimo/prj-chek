import type { PushSubscribeRequest } from '@cairn/shared';

/** Путь service worker: область видимости должна быть корневой. */
const WORKER_PATH = '/sw.js';

/** Есть ли в браузере всё, что нужно для подписки. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

/**
 * Переводит публичный ключ из base64url в байты.
 *
 * `applicationServerKey` принимает только байты, а ключ приходит строкой
 * в base64url — с «-» и «_» вместо «+» и «/» и без хвостового
 * выравнивания.
 */
export function applicationServerKeyOf(publicKey: string): Uint8Array {
  const padded = publicKey.padEnd(publicKey.length + ((4 - (publicKey.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Подписывает это устройство и отдаёт то, что нужно серверу. */
export async function subscribeDevice(publicKey: string): Promise<PushSubscribeRequest> {
  const registration = await navigator.serviceWorker.register(WORKER_PATH);
  const subscription = await registration.pushManager.subscribe({
    // Без этого браузер не отдаст подписку: показ уведомления обязателен.
    userVisibleOnly: true,
    applicationServerKey: applicationServerKeyOf(publicKey),
  });

  return keysOf(subscription);
}

/** Снимает подписку устройства и отдаёт её адрес для снятия на сервере. */
export async function unsubscribeDevice(): Promise<string | null> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER_PATH);
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    return null;
  }

  const { endpoint } = subscription;

  await subscription.unsubscribe();

  return endpoint;
}

/** Есть ли у этого устройства подписка. */
export async function hasDeviceSubscription(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration(WORKER_PATH);

  return Boolean(await registration?.pushManager.getSubscription());
}

/** Вынимает из подписки браузера то, что хранит сервер. */
function keysOf(subscription: PushSubscription): PushSubscribeRequest {
  const json = subscription.toJSON();

  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  };
}
