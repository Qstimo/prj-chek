import { RoadmapVersionState } from '@cairn/shared';
import {
  boolean,
  date,
  foreignKey,
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
import { projectTasks } from './tasks';

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
    releasedDate: date('released_date', { mode: 'string' }),
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
 * Чекпоинты: **размещение задачи в версии** и признак «закрыт».
 *
 * Прежде здесь лежала и формулировка. Она переехала в `project_tasks`
 * вместе со ссылкой и тегами платформ: задача приходит двумя путями и
 * живёт между версиями, а формулировка в двух местах разошлась бы — одна
 * и та же задача называлась бы в версии и в реестре по-разному.
 *
 * Что осталось здесь и почему именно здесь: `is_done` — потому что
 * прогресс считается по версии (ТЗ 3.5), `position` — потому что порядок
 * значим внутри версии, `carried_from_version_id` — потому что перенос
 * это свойство размещения, а не задачи.
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
    /**
     * Задача, которую это размещение держит в версии.
     *
     * Уникум ниже: задача стоит не более чем в одной версии. Две версии на
     * одну задачу означали бы, что «сделано» у неё двойное, а прогресс
     * двух версий считается из одного факта.
     */
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'restrict' }),
    isDone: boolean('is_done').notNull().default(false),
    position: integer('position').notNull(),
    /**
     * Версия, из которой чекпоинт перенесли.
     *
     * Нужна отчёту по релизу: «перенесено в v1.3» в отчёте v1.2 иначе не
     * собрать — после переноса чекпоинт этой версии уже не принадлежит, и
     * никакого другого следа о нём в ней не остаётся.
     *
     * Ни исполнителя, ни оценки, ни даты у чекпоинта от этого не
     * появляется (ТЗ 1.4): меняется только принадлежность версии, и
     * колонка помнит, откуда он приехал.
     *
     * `set null` при удалении, а не `restrict`: исчезла версия-источник —
     * исчезла и пометка, но сам чекпоинт остаётся на месте. `restrict`
     * сделал бы версию неудаляемой из-за чужой строки.
     *
     * Ссылка объявлена ниже с явным именем: имя по соглашению drizzle
     * («таблица_колонка_таблица_колонка_fk») выходит за предел 63 байтов,
     * PostgreSQL молча его обрезает, и в снапшоте оставалось бы одно имя,
     * а в базе — другое.
     */
    carriedFromVersionId: uuid('carried_from_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('roadmap_checkpoints_version_idx').on(table.versionId),
    unique('roadmap_checkpoints_task').on(table.taskId),
    foreignKey({
      columns: [table.carriedFromVersionId],
      foreignColumns: [roadmapVersions.id],
      name: 'roadmap_checkpoints_carried_from_fk',
    }).onDelete('set null'),
  ],
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

/**
 * Публичная ссылка на отчёт по релизу одной версии (дизайн доводки, 6).
 *
 * Своя таблица, а не колонка у `roadmap_public_links`: отчёт раскрывают
 * по одной версии — ту, что выпустили, — и общая со всем роадмапом ссылка
 * раскрывала бы заодно все остальные версии и планы.
 *
 * Ссылка висит на версии, а не на проекте: проект публикует отчёты по
 * разным версиям независимо, и уникум «одна ссылка на версию» это и
 * означает. Токен хранится открыто: его показывают владельцу повторно и
 * рассылают.
 */
export const roadmapReportPublicLinks = pgTable(
  'roadmap_report_public_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => roadmapVersions.id, { onDelete: 'restrict' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('roadmap_report_public_links_version').on(table.versionId),
    unique('roadmap_report_public_links_token').on(table.token),
  ],
);

/** Строка таблицы версий. */
export type RoadmapVersionRow = typeof roadmapVersions.$inferSelect;

/** Строка таблицы чекпоинтов. */
export type RoadmapCheckpointRow = typeof roadmapCheckpoints.$inferSelect;
