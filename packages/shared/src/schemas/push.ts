import { z } from 'zod';

/** Предел длины адреса push-службы: у вендоров он укладывается в 2000. */
const ENDPOINT_MAX = 2000;

/** Предел длины ключей браузера. */
const KEY_MAX = 500;

/**
 * Подписка устройства на пуши — то, что отдаёт `PushManager`.
 *
 * `endpoint` опознаёт устройство и наружу не отдаётся ни в каком ответе:
 * владение им позволяет посылать пуши в этот браузер.
 */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(ENDPOINT_MAX),
  /** Открытый ключ браузера для шифрования нагрузки. */
  p256dh: z.string().min(1).max(KEY_MAX),
  /** Секрет аутентификации браузера. */
  auth: z.string().min(1).max(KEY_MAX),
});

/** Снятие подписки. Адрес в теле, а не в URL: ему не место в логах. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(ENDPOINT_MAX),
});

/** Публичный VAPID-ключ. `null` — уведомления выключены на сервере. */
export const pushKeySchema = z.object({
  publicKey: z.string().nullable(),
});

/** Запрос подписки. */
export type PushSubscribeRequest = z.infer<typeof pushSubscribeSchema>;

/** Запрос снятия подписки. */
export type PushUnsubscribeRequest = z.infer<typeof pushUnsubscribeSchema>;

/** Ответ с публичным ключом. */
export type PushKeyResponse = z.infer<typeof pushKeySchema>;
