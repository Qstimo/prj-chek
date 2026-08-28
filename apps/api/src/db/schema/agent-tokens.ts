import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';
import { subjects } from './subjects';

/**
 * Токены агентов (ТЗ 7): машинные субъекты для MCP-доступа.
 *
 * Токен хранится хэшированным, как сессии, и показывается один раз.
 * Срок жизни обязателен: бессрочных токенов не бывает (ТЗ 7.4).
 * `canRevealVariables` — колонка, а не уровень выдачи: раскрытие значения
 * агенту разрешается только парой «уровень позволяет И флаг включён»,
 * чтобы включение флага не расширяло людской механизм (спека 2).
 */
export const agentTokens = pgTable(
  'agent_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    label: text('label').notNull(),
    tokenHash: text('token_hash').notNull(),
    canRevealVariables: boolean('can_reveal_variables').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [
    unique('agent_tokens_subject').on(table.subjectId),
    index('agent_tokens_project_idx').on(table.projectId),
  ],
);

/** Строка таблицы токенов агентов. */
export type AgentTokenRow = typeof agentTokens.$inferSelect;
