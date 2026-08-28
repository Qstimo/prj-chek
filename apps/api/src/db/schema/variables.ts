import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { environments } from './environments';
import { subjects } from './subjects';

/**
 * Переменные окружения проекта (ТЗ 3.3).
 *
 * Значения здесь нет: оно живёт в версиях, зашифрованным. Описание
 * существует ради уровня «метаданные» — знать, какие переменные нужны,
 * не видя значений (ТЗ 4.3).
 */
export const variables = pgTable(
  'variables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('variables_environment_key').on(table.environmentId, table.key),
    index('variables_environment_idx').on(table.environmentId),
  ],
);

/**
 * Версии значений: история линейна и только растёт.
 *
 * Текущее значение — версия с наибольшим номером; указателя «текущая»
 * нет намеренно — два источника правды разошлись бы (спека 3.2).
 * Откат создаёт новую версию, а не передвигает историю.
 */
export const variableVersions = pgTable(
  'variable_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variableId: uuid('variable_id')
      .notNull()
      .references(() => variables.id, { onDelete: 'restrict' }),
    versionNo: integer('version_no').notNull(),
    valueEncrypted: text('value_encrypted').notNull(),
    createdBySubjectId: uuid('created_by_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('variable_versions_variable_no').on(table.variableId, table.versionNo),
    index('variable_versions_variable_idx').on(table.variableId),
  ],
);

/** Строка таблицы переменных. */
export type VariableRow = typeof variables.$inferSelect;

/** Строка таблицы версий. */
export type VariableVersionRow = typeof variableVersions.$inferSelect;
