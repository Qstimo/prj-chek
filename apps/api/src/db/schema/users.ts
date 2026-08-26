import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subjects } from './subjects';

/**
 * Пользователи — люди с аутентификацией.
 *
 * Поля статуса нет намеренно: активность определяется по `subjects.revokedAt`.
 * Состояние «нет действующего пароля» выводится из `passwordHash IS NULL`
 * и охватывает как приглашённого, так и пользователя со сброшенным паролем (спека 4.2).
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectId: uuid('subject_id')
    .notNull()
    .unique()
    .references(() => subjects.id, { onDelete: 'restrict' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  totpSecretEncrypted: text('totp_secret_encrypted'),
  isTotpEnabled: boolean('is_totp_enabled').notNull().default(false),
  isSuperadmin: boolean('is_superadmin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Строка таблицы пользователей. */
export type User = typeof users.$inferSelect;
