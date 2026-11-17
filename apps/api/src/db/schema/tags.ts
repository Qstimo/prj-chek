import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';

/**
 * Реестр тегов проектов: верхнеуровневые метки сводки.
 *
 * Межпроектный реестр, в отличие от платформ: платформа «API» одного
 * проекта и «API» другого — разные каналы поставки, а тег «Web» ровно
 * потому и тег, что он один и тот же у всех, кто им помечен. Иначе
 * фильтровать сводку по нему было бы нечем.
 *
 * Своего экрана и своего права у реестра нет: он наполняется самим фактом
 * того, что тег кому-то приписали, — как корневой домен заводится
 * появлением адреса в окружении. Поэтому нет и отдельной ручки заведения:
 * тег, который никому не приписан, не отвечает ни на один вопрос и
 * уносится вместе с последней связью.
 *
 * `slug` — форма сопоставления (нижний регистр, пробелы в один),
 * `label` — то, что человек написал и видит. Уникален `slug`: без этого
 * в реестре появились бы «Web» и «web» двумя строками, и фильтр по
 * каждой показывал бы часть проектов.
 */
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Теги проекта: поле паспорта, а не своя сущность.
 *
 * Права проверяются по секции «Инфо» — тег стоит в одном ряду с
 * назначением и стеком. Порядка у набора нет: он показывается по `label`,
 * и хранить позицию значило бы спрашивать её у человека без причины.
 */
export const projectTags = pgTable(
  'project_tags',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.tagId] }),
    // Горячий путь уборки реестра: после снятия тега с проекта нужно
    // узнать, остался ли он хоть у кого-то. Левый префикс составного
    // ключа на этот вопрос не отвечает.
    index('project_tags_tag_idx').on(table.tagId),
  ],
);

/** Строка реестра тегов. */
export type TagRow = typeof tags.$inferSelect;
