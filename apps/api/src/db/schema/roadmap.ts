import { RoadmapVersionState } from '@cairn/shared';
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { projects } from './projects';

/** Состояние версии. Значения совпадают с контрактом. */
export const roadmapVersionStateEnum = pgEnum('roadmap_version_state', [
  RoadmapVersionState.Planned,
  RoadmapVersionState.InProgress,
  RoadmapVersionState.Released,
]);

/**
 * Версии роадмапа (ТЗ 3.5): последовательность с ручным состоянием.
 *
 * Порядок хранится в `position`: он значим и не выводим из обозначений —
 * сортировать «v2» и «Осень» лексикографически бессмысленно.
 * Прогресс не хранится: он вычисляется из чекпоинтов.
 */
export const roadmapVersions = pgTable(
  'roadmap_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    label: text('label').notNull(),
    plannedDate: date('planned_date', { mode: 'string' }),
    state: roadmapVersionStateEnum('state').notNull().default(RoadmapVersionState.Planned),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('roadmap_versions_project_label').on(table.projectId, table.label),
    index('roadmap_versions_project_idx').on(table.projectId),
  ],
);

/**
 * Чекпоинты: формулировка результата и признак «закрыт» — и всё.
 *
 * Исполнителей, оценок, дат, комментариев и вложенности не будет:
 * сознательное ограничение ТЗ 1.4, удерживающее продукт от трекера.
 */
export const roadmapCheckpoints = pgTable(
  'roadmap_checkpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => roadmapVersions.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    isDone: boolean('is_done').notNull().default(false),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('roadmap_checkpoints_version_idx').on(table.versionId)],
);

/**
 * Публичная ссылка роадмапа (ТЗ 3.5): единственная секция, видимая наружу.
 *
 * Опубликовано = строка существует; выключено = строки нет — тот же
 * принцип, что у выдач. Токен хранится открыто: его показывают и рассылают.
 */
export const roadmapPublicLinks = pgTable(
  'roadmap_public_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('roadmap_public_links_project').on(table.projectId),
    unique('roadmap_public_links_token').on(table.token),
  ],
);

/** Строка таблицы версий. */
export type RoadmapVersionRow = typeof roadmapVersions.$inferSelect;

/** Строка таблицы чекпоинтов. */
export type RoadmapCheckpointRow = typeof roadmapCheckpoints.$inferSelect;
