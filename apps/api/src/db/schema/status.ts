import { HealthState } from '@cairn/shared';
import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { environmentDomains } from './environments';

/** Результат health-проверки. Значения совпадают с контрактом. */
export const healthStateEnum = pgEnum('health_state', [HealthState.Up, HealthState.Down]);

/**
 * Последний результат проверок адреса окружения (ТЗ 6): жив ли он, срок
 * сертификата и срок регистрации.
 *
 * Все три проверки лежат в одной строке намеренно. Пока здоровье жило в
 * отдельной таблице со своим ключом, оно могло описывать не тот хост, о
 * котором отчитывались TLS и регистратор; с одним `domain_id` — не может.
 *
 * Хранится только последний результат: статус — состояние, а не история.
 * Отсутствие строки означает «ещё не проверялось».
 */
export const domainStatuses = pgTable(
  'domain_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => environmentDomains.id, { onDelete: 'restrict' }),
    /** Обнуляемый: адрес мог ещё ни разу не проверяться. */
    health: healthStateEnum('health'),
    latencyMs: integer('latency_ms'),
    healthError: text('health_error'),
    /** Во что разрешилось имя: по этому адресу находится машина. */
    resolvedIp: text('resolved_ip'),
    resolveError: text('resolve_error'),
    tlsValidTo: timestamp('tls_valid_to', { withTimezone: true }),
    tlsError: text('tls_error'),
    registryExpiresAt: timestamp('registry_expires_at', { withTimezone: true }),
    registryError: text('registry_error'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('domain_statuses_domain').on(table.domainId)],
);

/** Строка статуса адреса. */
export type DomainStatusRow = typeof domainStatuses.$inferSelect;
