import { ChronicleSource } from '@cairn/shared';
import { date, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';
import { subjects } from './subjects';

/** Источник записи. Значения совпадают с контрактом. */
export const chronicleSourceEnum = pgEnum('chronicle_source', [
  ChronicleSource.Manual,
  ChronicleSource.Webhook,
]);

/**
 * Записи хроники: лента «как мы к этому пришли» (ТЗ 3.6).
 *
 * `occurredOn` — дата события, отдельная от `createdAt`: сводка вчерашней
 * встречи — событие вчера, а не в момент пересылки. День без времени:
 * хроника оперирует днями, точный момент фиксирует `createdAt`.
 *
 * `createdBySubjectId` ссылается на субъект, а не на пользователя:
 * записи создают и люди, и приёмные адреса (ТЗ 2). Автор остаётся
 * в записи и после отзыва адреса — потому `restrict`, как везде.
 */
export const chronicleEntries = pgTable(
  'chronicle_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    source: chronicleSourceEnum('source').notNull().default(ChronicleSource.Manual),
    createdBySubjectId: uuid('created_by_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chronicle_entries_project_date_idx').on(table.projectId, table.occurredOn)],
);

/** Строка таблицы записей хроники. */
export type ChronicleEntry = typeof chronicleEntries.$inferSelect;
