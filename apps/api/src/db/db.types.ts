import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type * as schema from './schema';

/** Подключение к базе. */
export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Транзакция.
 *
 * Сервисы принимают её явным параметром: журналирование обязано происходить
 * в той же транзакции, что и действие (спека 7.3), а неявный контекст
 * транзакции легко потерять при рефакторинге.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Исполнитель запроса: подключение либо транзакция.
 *
 * Методы записи в репозиториях принимают этот тип, чтобы вызывающий сервис
 * мог передать транзакцию, а тесты — обычное подключение.
 */
export type Executor = Database | Transaction;
