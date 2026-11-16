import { HealthState, StatusCheckCode } from '@cairn/shared';
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

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
    /**
     * Код наблюдения: что именно увидела проверка доступности.
     *
     * Рядом с фразой, а не вместо неё: настоящая причина отказа лежит в
     * `Error.cause` кодом (`ECONNREFUSED`, `ENOTFOUND`), и пока в строку
     * писалось только сообщение обёртки, все отказы выглядели как
     * «не отвечает (fetch failed)» — по такой записи нельзя ни
     * расшифровать беду человеку, ни отличить одну от другой.
     *
     * `text`, а не `pgEnum`: список кодов пополняется снаружи — OpenSSL
     * и libuv добавляют свои без нашего участия, — и каждое пополнение
     * требовало бы `ALTER TYPE`. Закрытость обеспечена контрактом.
     */
    healthCode: text('health_code').$type<StatusCheckCode>(),
    /**
     * Куда ведёт перенаправление, если проверка его получила.
     *
     * 302 на чужое имя — рабочая настройка у одних и угнанная запись у
     * других, и разобрать это можно, только увидев цель.
     */
    redirectTo: text('redirect_to'),
    /**
     * Выбранный адрес имени: по нему находится машина.
     *
     * Первый из `resolved_ips` по возрастанию. Привязка у окружения одна,
     * и выбирать её надо так, чтобы выбор не менялся от прогона к прогону.
     */
    resolvedIp: text('resolved_ip'),
    /**
     * Все адреса записи.
     *
     * Резолверы ротируют порядок ответа: пока хранилась первая запись,
     * адрес плясал от прогона к прогону, предупреждение о расхождении
     * мигало, а за CDN висело вечно. Обнуляемый: строка, записанная до
     * появления колонки, множества не знает, и пустой список был бы о
     * ней неправдой.
     */
    resolvedIps: text('resolved_ips').array(),
    resolveError: text('resolve_error'),
    tlsValidTo: timestamp('tls_valid_to', { withTimezone: true }),
    /**
     * Приняла ли система сертификат; `null` — рукопожатия не было.
     *
     * Отдельно от срока: проверка коннектится с `rejectUnauthorized:
     * false`, чтобы увидеть и просроченный сертификат, — и без этой
     * колонки зелёное «TLS до 2027-03-01» уживалось в одном ответе с
     * красным «не отвечает», потому что `fetch` тот же сертификат
     * отвергал.
     */
    tlsTrusted: boolean('tls_trusted'),
    /** Чем сертификат не угодил либо почему рукопожатие не вышло. */
    tlsCode: text('tls_code').$type<StatusCheckCode>(),
    tlsError: text('tls_error'),
    registryExpiresAt: timestamp('registry_expires_at', { withTimezone: true }),
    registryError: text('registry_error'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('domain_statuses_domain').on(table.domainId)],
);

/** Строка статуса адреса. */
export type DomainStatusRow = typeof domainStatuses.$inferSelect;
