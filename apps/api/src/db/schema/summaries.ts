import { SummaryTaskOrigin } from '@cairn/shared';
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { chronicleEntries } from './chronicle';
import { projects } from './projects';
import { roadmapVersions } from './roadmap';
import { subjects } from './subjects';

/** Кем предложена задача черновика. Значения совпадают с контрактом. */
export const summaryTaskOriginEnum = pgEnum('summary_task_origin', [
  SummaryTaskOrigin.Model,
  SummaryTaskOrigin.Human,
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
  (table) => [index('summaries_project_created_idx').on(table.projectId, table.createdAt.desc())],
);

/**
 * Задача черновика до переезда в роадмап.
 *
 * По составу полей **беднее** чекпоинта, а не богаче: ни адреса задачи,
 * ни тегов платформ, ни даты, ни исполнителя (ТЗ 1.4). Адрес и теги
 * ставятся после переезда штатной формой чекпоинта: придуманный моделью
 * тег платформы поставил бы в роадмап заявление, которого никто не
 * делал.
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
    position: integer('position').notNull(),
    /** Признак «предложено моделью» для интерфейса и журнала релиза. */
    origin: summaryTaskOriginEnum('origin').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('summary_task_drafts_summary_idx').on(table.summaryId, table.position)],
);

/** Строка саммари. */
export type SummaryRow = typeof summaries.$inferSelect;

/** Строка черновика задач. */
export type SummaryTaskDraftRow = typeof summaryTaskDrafts.$inferSelect;
