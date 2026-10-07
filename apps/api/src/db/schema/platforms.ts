import { PlatformKind, PlatformReleaseState } from '@cairn/shared';
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { environments } from './environments';
import { projects } from './projects';
import { roadmapCheckpoints, roadmapVersions } from './roadmap';

/** Вид платформы. Значения совпадают с контрактом. */
export const platformKindEnum = pgEnum('platform_kind', [
  PlatformKind.Server,
  PlatformKind.Store,
  PlatformKind.Other,
]);

/** Состояние выпуска. Значения совпадают с контрактом. */
export const platformReleaseStateEnum = pgEnum('platform_release_state', [
  PlatformReleaseState.OnTest,
  PlatformReleaseState.InReview,
  PlatformReleaseState.Released,
  PlatformReleaseState.Rejected,
]);

/**
 * Платформы проекта: каналы поставки.
 *
 * Поле паспорта проекта, а не межпроектный реестр вроде серверов и
 * доменов: «API» одного проекта и «API» другого — разные вещи, и общего
 * экрана у них нет. Имя свободное, вид закрытый: магазинов много.
 *
 * `position` хранится: порядок строк сводки значим и из имён не выводим.
 */
export const projectPlatforms = pgTable(
  'project_platforms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    kind: platformKindEnum('kind').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('project_platforms_project_name').on(table.projectId, table.name),
    index('project_platforms_project_idx').on(table.projectId),
  ],
);

/**
 * Что развёрнуто в окружении.
 *
 * Связь, а не поле окружения и не поле платформы: в одном окружении живёт
 * несколько платформ, и одна платформа живёт в нескольких окружениях —
 * прод и стейдж. Поле на любой из сторон потребовало бы дублировать
 * машину и адреса.
 */
export const environmentPlatforms = pgTable(
  'environment_platforms',
  {
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.environmentId, table.platformId] }),
    index('environment_platforms_platform_idx').on(table.platformId),
  ],
);

/**
 * Выпуск версии на платформе.
 *
 * Строка появляется, когда платформа разошлась с версией: уехала на тест,
 * отправлена на модерацию, вышла, отклонена. Её отсутствие означает «идёт
 * вместе с версией» — поэтому состояний «запланирована» и «в работе»
 * здесь нет, они принадлежат версии.
 *
 * Индекса по версии нет намеренно: левый префикс уникального ограничения
 * обслуживает выборку по ней — PostgreSQL реализует UNIQUE через
 * btree-индекс, и второй был бы мёртвым весом на записи.
 */
export const versionPlatformReleases = pgTable(
  'version_platform_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => roadmapVersions.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
    state: platformReleaseStateEnum('state').notNull(),
    releasedDate: date('released_date', { mode: 'string' }),
    /** Своё обозначение сборки. Пусто — как у версии. */
    buildLabel: text('build_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('version_platform_releases_version_platform').on(table.versionId, table.platformId),
    index('version_platform_releases_platform_idx').on(table.platformId),
  ],
);

/**
 * Теги платформ у чекпоинта: куда едет результат.
 *
 * Не исполнитель, не оценка, не дата и не вложенность — ограничение ТЗ 1.4
 * остаётся в силе.
 */
export const checkpointPlatforms = pgTable(
  'checkpoint_platforms',
  {
    checkpointId: uuid('checkpoint_id')
      .notNull()
      .references(() => roadmapCheckpoints.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.checkpointId, table.platformId] }),
    index('checkpoint_platforms_platform_idx').on(table.platformId),
  ],
);

/** Строка таблицы платформ. */
export type ProjectPlatformRow = typeof projectPlatforms.$inferSelect;

/** Строка таблицы выпусков. */
export type PlatformReleaseRow = typeof versionPlatformReleases.$inferSelect;
