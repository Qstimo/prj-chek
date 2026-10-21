import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { environmentDomains } from './environments';

/**
 * Падение адреса как отрезок времени (дизайн уведомлений, раздел 3).
 *
 * Строка статуса отвечает на вопрос «как сейчас» и перезаписывается; здесь
 * лежит «когда и сколько». Открытый инцидент — он же ответ на «лежит с
 * какого момента», и колонки `down_since` в статусе нет намеренно: второе
 * место хранения того же факта разошлось бы с первым.
 *
 * Частичный уникальный индекс делает второй пуш об одном падении
 * невозможным: правило живёт в базе, а не в памяти процесса, и перезапуск
 * API не рассылает заново то, что уже известно.
 *
 * Ссылка `restrict`, а не каскад: каскадов в проекте нет, строки уносит
 * репозиторий окружений явно, в той же транзакции, что и строки статусов.
 */
export const addressIncidents = pgTable(
  'address_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => environmentDomains.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Обнуляемый: пусто — адрес не отвечает до сих пор. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** Причина на момент падения; могла и не определиться. */
    cause: text('cause'),
  },
  (table) => [
    uniqueIndex('address_incidents_open')
      .on(table.domainId)
      .where(sql`${table.resolvedAt} is null`),
    // Для чтения истории: частичный индекс выше видит только открытые
    // строки, а экран адреса читает все.
    index('address_incidents_domain').on(table.domainId, table.startedAt.desc()),
  ],
);

/** Строка инцидента. */
export type AddressIncidentRow = typeof addressIncidents.$inferSelect;
