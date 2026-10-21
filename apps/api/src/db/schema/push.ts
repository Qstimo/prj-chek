import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subjects } from './subjects';

/**
 * Подписка устройства на веб-пуши (дизайн уведомлений, раздел 3).
 *
 * Принадлежит субъекту, а не пользователю: модель прав для людей и машин
 * единая, и адресаты считаются по выдачам субъекта. Подписываться при этом
 * может только субъект вида `user` — у токена агента браузера нет.
 *
 * `endpoint` уникален, потому что он и опознаёт устройство: браузер
 * пересоздаёт подписку сам, когда push-служба меняет ключи, и повторная
 * подписка должна обновлять строку, а не плодить вторую.
 */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'restrict' }),
  /** Адрес push-службы. Наружу не отдаётся ни в каком ответе. */
  endpoint: text('endpoint').notNull().unique(),
  /** Открытый ключ браузера. */
  p256dh: text('p256dh').notNull(),
  /** Секрет аутентификации браузера. */
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Строка подписки. */
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
