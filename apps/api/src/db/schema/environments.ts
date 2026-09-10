import { EnvironmentKind } from '@cairn/shared';
import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { domains } from './domains';
import { projects } from './projects';
import { servers } from './servers';

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
    /**
     * Собственный адрес окружения. Перекрывает адрес машины: окружение
     * может жить на поддомене или нестандартном порту.
     */
    host: text('host'),
    /**
     * Машина, на которой живёт окружение.
     *
     * `restrict`, а не каскад: удаление сервера должно быть осознанным
     * переносом окружений, а не тихим обрывом связи.
     */
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'restrict' }),
    healthCheckUrl: text('health_check_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('environments_project_name').on(table.projectId, table.name),
    index('environments_project_idx').on(table.projectId),
    index('environments_server_idx').on(table.serverId),
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
    /**
     * Корень, за который платят. Обязателен: домен без корня некому
     * продлевать, и такое состояние бессмысленно. Заполняется
     * репозиторием автоматически по имени (спека этапа 10, раздел 3).
     */
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('environment_domains_environment_name').on(table.environmentId, table.name),
    index('environment_domains_environment_idx').on(table.environmentId),
    index('environment_domains_domain_idx').on(table.domainId),
  ],
);

/** Строка таблицы окружений. */
export type Environment = typeof environments.$inferSelect;

/** Строка таблицы доменов. */
export type EnvironmentDomain = typeof environmentDomains.$inferSelect;
