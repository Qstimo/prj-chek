import { SummaryTaskOrigin, SummaryTaskState } from '@cairn/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { chronicleEntries } from './chronicle';
import { projectPlatforms } from './platforms';
import { projects } from './projects';
import { roadmapVersions } from './roadmap';
import { subjects } from './subjects';
import { projectTasks } from './tasks';

/** Кем предложена задача черновика. Значения совпадают с контрактом. */
export const summaryTaskOriginEnum = pgEnum('summary_task_origin', [
  SummaryTaskOrigin.Model,
  SummaryTaskOrigin.Human,
]);

export const summaryTaskStateEnum = pgEnum('summary_task_state', [
  SummaryTaskState.Active,
  SummaryTaskState.Archived,
  SummaryTaskState.Released,
]);

/**
 * Саммари созвона: черновик задач над записью хроники (дизайн, раздел 2).
 *
 * Своей колонки текста нет намеренно — текст лежит в
 * `chronicle_entries.content`, и вторая копия разошлась бы с первой при
 * первой же правке. Колонки стадии тоже нет: стадия вычисляется из
 * содержимого (задач нет / есть / релиз сформирован), а хранимая
 * разошлась бы с ним при удалении последней задачи.
 *
 * `released_version_id` — `set null` по образцу
 * `roadmap_checkpoints.carried_from_version_id`: удалённая версия не
 * обязана делать саммари неудаляемым, а «ушло в версию, которой больше
 * нет» честнее, чем молчание.
 */
export const summaries = pgTable(
  'summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    /** Уникален: два черновика над одним текстом — вопрос без ответа. */
    chronicleEntryId: uuid('chronicle_entry_id')
      .notNull()
      .unique('summaries_chronicle_entry')
      .references(() => chronicleEntries.id, { onDelete: 'restrict' }),
    createdBySubjectId: uuid('created_by_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    releasedVersionId: uuid('released_version_id').references(() => roadmapVersions.id, {
      onDelete: 'set null',
    }),
    /** Чем построена текущая разбивка. Ключ API сюда не попадает никогда. */
    suggesterName: text('suggester_name'),
    suggesterModel: text('suggester_model'),
    suggestedAt: timestamp('suggested_at', { withTimezone: true }),
    /** null сохраняет неизвестность числа у разбивок до появления счётчика. */
    suggesterDropped: integer('suggester_dropped'),
    /**
     * Момент текста, по которому построена текущая разбивка.
     *
     * Нужен одному: заметить, что запись правили после разбивки, и
     * сказать об этом человеку. Предупреждение, а не отказ (раздел 2.5).
     */
    suggestedTextAt: timestamp('suggested_text_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('summaries_project_created_idx').on(table.projectId, table.createdAt.desc()),
    check('summaries_suggester_dropped_nonnegative', sql`${table.suggesterDropped} >= 0`),
  ],
);

/**
 * Задача саммари сохраняет состояние и связь с версией после релиза.
 *
 * По составу полей **беднее чекпоинта или равна ему, но не богаче**: ни
 * исполнителя, ни оценки, ни даты, ни вложенности (ТЗ 1.4). Адрес задачи
 * и теги платформ — ровно те два поля, которые у чекпоинта есть, и в
 * черновике они появились потому, что без них человек проходил список
 * **дважды**: формулировки здесь, ссылки и теги — формой чекпоинта в
 * роадмапе, уже без текста созвона перед глазами.
 *
 * Заполняет оба поля **человек**. Из вывода модели по-прежнему берётся
 * только формулировка: у строк с `origin = model` ссылки нет и тегов нет,
 * и придуманный моделью тег платформы так и остаётся невозможным — ей
 * нечем назвать платформу.
 *
 * Реляционная таблица, а не `draft jsonb`: проверять состав элементов в
 * базе пришлось бы своей SQL-функцией, а в проекте нет ни триггеров, ни
 * своих функций. Форму элементов проверяет zod на входе — там же, где
 * всё остальное.
 */
export const summaryTaskDrafts = pgTable(
  'summary_task_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    summaryId: uuid('summary_id')
      .notNull()
      .references(() => summaries.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    /**
     * Ссылка на задачу во внешнем трекере; ставит человек, у строк от
     * модели всегда пусто. Та же колонка, что у чекпоинта: формат
     * проверяет zod на входе, а не база.
     */
    url: text('url'),
    position: integer('position').notNull(),
    /** Признак «предложено моделью» для интерфейса и журнала релиза. */
    origin: summaryTaskOriginEnum('origin').notNull(),
    state: summaryTaskStateEnum('state').notNull().default(SummaryTaskState.Active),
    releasedVersionId: uuid('released_version_id').references(() => roadmapVersions.id, {
      onDelete: 'set null',
    }),
    /**
     * Задача реестра, в которую строка превратилась на релизе.
     *
     * `set null`: задачу удалили из реестра — строка остаётся в состоянии
     * `released` и помнит, что уехала, но назвать куда больше не может.
     * Пусто и у строк, уехавших до появления реестра: неизвестное не
     * выдумывается.
     *
     * Ссылка объявлена ниже с явным именем: имя по соглашению drizzle
     * вышло бы за предел 63 байтов, PostgreSQL молча обрезал бы его, и
     * снапшот разошёлся бы с базой.
     */
    taskId: uuid('task_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('summary_task_drafts_summary_state_idx').on(table.summaryId, table.state, table.position),
    foreignKey({
      columns: [table.taskId],
      foreignColumns: [projectTasks.id],
      name: 'summary_task_drafts_task_fk',
    }).onDelete('set null'),
  ],
);

/**
 * Теги платформ у задачи черновика: куда едет результат.
 *
 * Зеркало `checkpoint_platforms` — та же пара, тот же составной ключ, тот
 * же `restrict`: теги уезжают в чекпоинт как есть, и расхождение в
 * устройстве двух наборов одних и тех же тегов пришлось бы помнить при
 * каждой правке.
 *
 * Не массив `uuid[]` у строки черновика: массив не ссылается, и удалённая
 * платформа оставила бы висячий идентификатор, который уронил бы **шаг
 * релиза** — единственный необратимый шаг потока (дизайн, 4.2).
 *
 * Имя короче, чем `summary_task_draft_platforms`, намеренно: имя внешнего
 * ключа по соглашению drizzle вышло бы за 63 байта, PostgreSQL молча
 * обрезал бы его, и снапшот разошёлся бы с базой.
 */
export const summaryTaskPlatforms = pgTable(
  'summary_task_platforms',
  {
    draftId: uuid('draft_id')
      .notNull()
      .references(() => summaryTaskDrafts.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.platformId] }),
    index('summary_task_platforms_platform_idx').on(table.platformId),
  ],
);

/** Строка саммари. */
export type SummaryRow = typeof summaries.$inferSelect;

/** Строка черновика задач. */
export type SummaryTaskDraftRow = typeof summaryTaskDrafts.$inferSelect;
