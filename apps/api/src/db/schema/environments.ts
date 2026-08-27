import { EnvironmentKind } from '@cairn/shared';
import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';

/** Вид окружения. Значения совпадают с контрактом. */
export const environmentKindEnum = pgEnum('environment_kind', [
  EnvironmentKind.Production,
  EnvironmentKind.Staging,
  EnvironmentKind.Development,
  EnvironmentKind.Other,
]);

/**
 * Окружения проекта (ТЗ 3.2).
 *
 * Двухуровневая схема «проект → окружение» обязательна: без неё нельзя
 * описать проект, у которого прод и стейдж на разных машинах.
 *
 * Все поля, кроме имени и вида, необязательны: реестр заполняется
 * постепенно, и запись, заведённая за минуту до совещания, полезнее
 * отсутствующей.
 */
export const environments = pgTable(
  'environments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    kind: environmentKindEnum('kind').notNull(),
    host: text('host'),
    ip: text('ip'),
    provider: text('provider'),
    specs: text('specs'),
    healthCheckUrl: text('health_check_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('environments_project_name').on(table.projectId, table.name),
    index('environments_project_idx').on(table.projectId),
  ],
);

/**
 * Домены окружения.
 *
 * Отдельная таблица нужна не сегодня, а этапу 6: проверки будут писать
 * по каждому домену срок регистрации и состояние сертификата, и хранить
 * это в строке пришлось бы разбором текста.
 */
export const environmentDomains = pgTable(
  'environment_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('environment_domains_environment_name').on(table.environmentId, table.name),
    index('environment_domains_environment_idx').on(table.environmentId),
  ],
);

/** Строка таблицы окружений. */
export type Environment = typeof environments.$inferSelect;

/** Строка таблицы доменов. */
export type EnvironmentDomain = typeof environmentDomains.$inferSelect;
