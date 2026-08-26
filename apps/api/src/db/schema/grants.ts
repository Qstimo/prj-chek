import { AccessLevel, Section } from '@cairn/shared';
import { index, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';
import { subjects } from './subjects';
import { users } from './users';

/** Секции проекта. Все шесть заводятся сразу, включая нереализованные (спека 4.3). */
export const sectionEnum = pgEnum('section', [
  Section.Info,
  Section.Infrastructure,
  Section.Variables,
  Section.Docs,
  Section.Roadmap,
  Section.Chronicle,
]);

/** Уровни доступа. Значения «нет» нет: оно выражается отсутствием строки. */
export const accessLevelEnum = pgEnum('access_level', [
  AccessLevel.Metadata,
  AccessLevel.Read,
  AccessLevel.Write,
]);

/**
 * Выдачи доступа — ядро модели прав: «субъект × проект × секция × уровень» (ТЗ 4.1).
 *
 * Отзыв доступа — удаление строки. Выдавать и отзывать вправе только
 * суперадмин, независимо от его уровня доступа к проекту (спека 4.3).
 */
export const grants = pgTable(
  'grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    section: sectionEnum('section').notNull(),
    level: accessLevelEnum('level').notNull(),
    grantedBy: uuid('granted_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('grants_subject_project_section').on(table.subjectId, table.projectId, table.section),
    index('grants_subject_idx').on(table.subjectId),
    index('grants_project_idx').on(table.projectId),
  ],
);

/** Строка таблицы выдач. */
export type Grant = typeof grants.$inferSelect;
