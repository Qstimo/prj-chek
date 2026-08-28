import { HealthState } from '@cairn/shared';
import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { environmentDomains, environments } from './environments';

/** Результат health-проверки. Значения совпадают с контрактом. */
export const healthStateEnum = pgEnum('health_state', [HealthState.Up, HealthState.Down]);

/**
 * Последний результат проверки окружения (ТЗ 6).
 *
 * Хранится только последний: статус — состояние, а не история.
 * Отсутствие строки означает «ещё не проверялось».
 */
export const environmentStatuses = pgTable(
  'environment_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'restrict' }),
    health: healthStateEnum('health').notNull(),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('environment_statuses_environment').on(table.environmentId)],
);

/** Последний результат проверок домена: срок TLS и срок регистрации. */
export const domainStatuses = pgTable(
  'domain_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => environmentDomains.id, { onDelete: 'restrict' }),
    tlsValidTo: timestamp('tls_valid_to', { withTimezone: true }),
    tlsError: text('tls_error'),
    registryExpiresAt: timestamp('registry_expires_at', { withTimezone: true }),
    registryError: text('registry_error'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('domain_statuses_domain').on(table.domainId)],
);

/** Строка статуса окружения. */
export type EnvironmentStatusRow = typeof environmentStatuses.$inferSelect;

/** Строка статуса домена. */
export type DomainStatusRow = typeof domainStatuses.$inferSelect;
