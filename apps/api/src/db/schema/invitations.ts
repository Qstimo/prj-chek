import { InvitationKind } from '@cairn/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

/** Вид одноразовой ссылки на установку пароля. */
export const invitationKindEnum = pgEnum('invitation_kind', [
  InvitationKind.Invitation,
  InvitationKind.PasswordReset,
]);

/**
 * Одноразовые ссылки на установку пароля — приглашения и сбросы.
 *
 * Живая ссылка возможна только для пользователя без действующего пароля,
 * иначе ссылка стала бы обходом аутентификации (спека 4.6).
 * Адрес почты берётся из `users` по `userId` и здесь не дублируется.
 */
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  tokenHash: text('token_hash').notNull().unique(),
  kind: invitationKindEnum('kind').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'restrict' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Строка таблицы ссылок. */
export type Invitation = typeof invitations.$inferSelect;
