import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import webpush from 'web-push';

import type { StoredSubscription } from './push.repository';

/** Цель отправки в том виде, в каком её ждёт push-служба. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Отправка одной нагрузки; в тестах подменяется подделкой. */
export type PushTransport = (target: PushTarget, payload: string) => Promise<void>;

/** Токен внедрения транспорта. `null` — уведомления выключены. */
export const PUSH_TRANSPORT = Symbol('PUSH_TRANSPORT');

/** Итог отправки: что делать с подпиской дальше. */
export enum SendOutcome {
  Delivered = 'delivered',
  /** Подписки больше нет: устройство отозвало её. */
  Gone = 'gone',
  /** Беда службы, а не устройства: подписку не трогать. */
  Failed = 'failed',
  /** Ключи не заданы: отправлять нечем. */
  Disabled = 'disabled',
}

/** Коды, означающие, что подписки больше не существует. */
const GONE_CODES = [404, 410];

/** Лог фабрики: она работает до появления экземпляра отправителя. */
const factoryLogger = new Logger('PushTransport');

/**
 * Боевой транспорт на `web-push`.
 *
 * `null`, когда ключи не заданы: уведомления выключаются целиком, как
 * прогон проверок при `CAIRN_STATUS_CHECK_INTERVAL_MINUTES=0`. Отдельного
 * флага «включить уведомления» нет — наличие ключей и есть флаг.
 *
 * Негодные ключи выключают уведомления так же, как незаданные, а не
 * бросают: фабрика работает при инициализации Nest, и исключение здесь
 * уводило бы контейнер API в перезапуск по кругу — из-за необязательной
 * функции падал бы весь реестр. `setVapidDetails` разборчив: он требует
 * `mailto:` либо `https:` в subject и ключи точной длины в base64url.
 */
export function realTransport(): PushTransport | null {
  const publicKey = process.env.CAIRN_VAPID_PUBLIC_KEY;
  const privateKey = process.env.CAIRN_VAPID_PRIVATE_KEY;
  const subject = process.env.CAIRN_VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (cause) {
    // Сами ключи в лог не пишутся: приватный — секрет.
    factoryLogger.error(`Ключи уведомлений негодны, уведомления выключены: ${cause}`);

    return null;
  }

  return async (target, payload) => {
    await webpush.sendNotification(target, payload);
  };
}

/**
 * Отправка пуша по одной подписке.
 *
 * Не знает ни о правах, ни об инцидентах: умеет послать и разобрать
 * отказ. Поэтому второй канал — это второй отправитель, и ничего больше.
 */
@Injectable()
export class PushSender {
  private readonly logger = new Logger(PushSender.name);

  constructor(
    @Optional() @Inject(PUSH_TRANSPORT) private readonly transport: PushTransport | null,
  ) {}

  /** Посылает нагрузку и говорит, что делать с подпиской. */
  async send(subscription: StoredSubscription, payload: string): Promise<SendOutcome> {
    if (!this.transport) {
      return SendOutcome.Disabled;
    }

    try {
      await this.transport(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );

      return SendOutcome.Delivered;
    } catch (cause) {
      const statusCode = (cause as { statusCode?: number }).statusCode;

      if (statusCode !== undefined && GONE_CODES.includes(statusCode)) {
        return SendOutcome.Gone;
      }

      // Адрес службы в лог не пишется: им владеют как ключом.
      this.logger.warn(`Пуш не доставлен: ${statusCode ?? 'без кода'}`);

      return SendOutcome.Failed;
    }
  }
}
