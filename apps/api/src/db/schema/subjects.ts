import { SubjectKind } from '@cairn/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Вид субъекта доступа. Значения совпадают с {@link SubjectKind} из контракта. */
export const subjectKindEnum = pgEnum('subject_kind', [
  SubjectKind.User,
  SubjectKind.AgentToken,
  SubjectKind.IntakeAddress,
]);

/**
 * Субъекты доступа: люди и машины в одной таблице (ТЗ 2).
 *
 * Физическое удаление не предусмотрено — оно разорвало бы связи в журнале.
 * Отзыв выражается заполнением `revokedAt` (спека 4.1).
 */
export const subjects = pgTable('subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: subjectKindEnum('kind').notNull(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/** Строка таблицы субъектов. */
export type Subject = typeof subjects.$inferSelect;
