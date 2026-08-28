import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';
import { subjects } from './subjects';

/**
 * Страницы документации (ТЗ 3.4): «как это устроено сейчас».
 *
 * Версий нет намеренно: страница — актуальное состояние; кто и когда
 * правил, фиксирует журнал, а историю событий ведёт хроника (ТЗ 3.6).
 * `content` — Markdown-текст как есть; интерпретация — забота клиента.
 */
export const docPages = pgTable(
  'doc_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    createdBySubjectId: uuid('created_by_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('doc_pages_project_title').on(table.projectId, table.title),
    index('doc_pages_project_idx').on(table.projectId),
  ],
);

/** Строка таблицы страниц. */
export type DocPageRow = typeof docPages.$inferSelect;
