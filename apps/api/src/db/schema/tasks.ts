import { TaskOrigin } from '@cairn/shared';
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { projectPlatforms } from './platforms';
import { projects } from './projects';
import { summaries } from './summaries';

/** Каким путём задача появилась. Значения совпадают с контрактом. */
export const taskOriginEnum = pgEnum('task_origin', [
  TaskOrigin.Manual,
  TaskOrigin.Summary,
  TaskOrigin.Roadmap,
]);

/**
 * Задачи проекта: формулировка результата и указатель во внешний трекер.
 *
 * Принадлежат **проекту**, а не версии: задача приходит руками, из саммари
 * и из роадмапа, живёт между версиями и может ждать вне них вовсе. Место
 * в версии — отдельная строка (`roadmap_checkpoints`), и признак «закрыт»
 * живёт там же: прогресс считается по версии (ТЗ 3.5), и признак у задачи
 * означал бы, что вынутая из версии задача меняет прогресс версии, в
 * которой её уже нет.
 *
 * Чего у задачи нет и не будет: исполнителя, оценки, даты, комментариев и
 * вложенности (ТЗ 1.4). Ровно за этим её и отправляют во внешний трекер —
 * исполнителей ведёт он.
 */
export const projectTasks = pgTable(
  'project_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    /**
     * Ссылка на задачу во внешнем трекере, вписанная человеком.
     *
     * Та же колонка, что была у чекпоинта: формат проверяет zod на входе,
     * а не база. Наружу (в публичный роадмап) не отдаётся.
     */
    url: text('url'),
    origin: taskOriginEnum('origin').notNull(),
    /**
     * Саммари, из которого задача приехала.
     *
     * `set null`: саммари удалили — задача остаётся, но происхождение
     * больше не назвать. `restrict` сделал бы саммари неудаляемым из-за
     * задачи, которая живёт своей жизнью в роадмапе.
     */
    sourceSummaryId: uuid('source_summary_id').references(() => summaries.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('project_tasks_project_idx').on(table.projectId)],
);

/**
 * Теги платформ у задачи: куда едет результат.
 *
 * Переезд `checkpoint_platforms` и `summary_task_platforms` по смыслу: тег
 * принадлежит задаче, и пока он висел на размещении, вынутая из версии
 * задача теряла бы теги вместе с местом.
 *
 * Не массив `uuid[]` у строки задачи: массив не ссылается, и удалённая
 * платформа оставила бы висячий идентификатор.
 */
export const projectTaskPlatforms = pgTable(
  'project_task_platforms',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.platformId] }),
    index('project_task_platforms_platform_idx').on(table.platformId),
  ],
);

/** Строка таблицы задач. */
export type ProjectTaskRow = typeof projectTasks.$inferSelect;
