import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from '../src/db/schema';

/** Поднятая на время тестов база. */
export interface TestDatabase {
  /** Подключение с полными правами: нужно для подготовки данных. */
  db: PostgresJsDatabase<typeof schema>;
  /** Подключение ролью приложения: с ним проверяются ограничения прав. */
  appDb: PostgresJsDatabase<typeof schema>;
  stop: () => Promise<void>;
  truncate: () => Promise<void>;
  /**
   * Все строки таблицы — для проверок уборки за удалением.
   *
   * Полными правами, а не ролью приложения: тест проверяет, что строк
   * не осталось, и отказ в правах выглядел бы как пустая таблица.
   */
  rowsOf: <T extends PgTable>(table: T) => Promise<T['$inferSelect'][]>;
  /**
   * Ещё одно независимое подключение к той же базе, в одно соединение.
   *
   * Нужно проверкам гонок с замком, который держится на своём соединении:
   * `db` и `appDb` — пулы по одному соединению, и писателей, которым нужно
   * по два (рабочее плюс замок), с ними помещается только один. Второй ждал
   * бы тогда не замка в базе, а свободного соединения в пуле, — и сторож
   * остался бы зелёным даже у кода без замка.
   *
   * Закрывается вместе с фикстурой: открытое соединение не дало бы
   * контейнеру остановиться.
   */
  pool: () => PostgresJsDatabase<typeof schema>;
}

/**
 * Поднимает PostgreSQL в контейнере, заводит роль приложения и применяет миграции.
 *
 * Порядок обязателен: миграция `0001` выдаёт права роли `cairn_app`, и если
 * роли ещё нет, PostgreSQL ответит «role does not exist», а `migrate` бросит
 * исключение.
 *
 * Привилегии здесь **не выдаются**. Их выдаёт та самая миграция из репозитория,
 * которую проверяет тест: продублируй гранты в фикстуре — и тест останется
 * зелёным, даже если миграцию сломают, забудут зарегистрировать в `_journal.json`
 * или она окажется пропущенной.
 */
export async function startTestDatabase(beforeMigration?: {
  index: number;
  seed: (db: TestDatabase['db']) => Promise<void>;
}): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  )
    // Одноразовая тестовая база не требует сохранности после сбоя хоста.
    // На Docker Desktop синхронизация каждого WAL-запроса растягивает
    // фикстуры до таймаута; проверки транзакций и прав остаются включены.
    .withEnvironment({ POSTGRES_INITDB_ARGS: '--no-sync' })
    .withCommand(['postgres', '-c', 'fsync=off'])
    .start();

  const ownerClient = postgres(container.getConnectionUri(), { max: 1 });
  const db = drizzle(ownerClient, { schema });

  // Роль создаётся до миграций: миграция прав на неё ссылается.
  await db.execute(sql`CREATE ROLE cairn_app WITH LOGIN PASSWORD 'test_app_password'`);
  await db.execute(sql`GRANT USAGE ON SCHEMA public TO cairn_app`);

  const config = { migrationsFolder: './drizzle' };
  if (beforeMigration) {
    const migrations = readMigrationFiles(config);
    if (!migrations[beforeMigration.index]) {
      throw new Error(`Миграция с индексом ${beforeMigration.index} отсутствует`);
    }
    // Разделяем цепочку, чтобы данные прошли через миграцию с прежней схемы.
    const migrationDb = drizzle<Record<never, never>>(ownerClient);
    await new PgDialect().migrate(migrations.slice(0, beforeMigration.index), migrationDb._.session, config);
    await beforeMigration.seed(db);
  }
  await migrate(db, config);

  const appClient = postgres(container.getConnectionUri(), {
    max: 1,
    user: 'cairn_app',
    password: 'test_app_password',
  });

  /** Открытые по запросу подключения: их закрывает `stop`. */
  const extraClients: ReturnType<typeof postgres>[] = [];

  return {
    db,
    appDb: drizzle(appClient, { schema }),
    rowsOf: (table) => db.select().from(table),
    pool: () => {
      // Ролью приложения, как `appDb`: проверка гонки должна упираться в
      // замок, а не в права, которых у боевой роли нет.
      const client = postgres(container.getConnectionUri(), {
        max: 1,
        user: 'cairn_app',
        password: 'test_app_password',
      });

      extraClients.push(client);

      return drizzle(client, { schema });
    },
    stop: async () => {
      await Promise.all(extraClients.map((client) => client.end()));
      await appClient.end();
      await ownerClient.end();
      await container.stop();
    },
    truncate: async () => {
      await db.execute(sql`
        TRUNCATE TABLE audit_log, agent_tokens, grants, sessions, invitations, totp_challenges,
                       domain_statuses, address_incidents, status_observation_gaps,
                       push_subscriptions,
                       task_exports, project_task_platforms, version_platform_releases,
                       environment_platforms, project_platforms,
                       roadmap_report_public_links, roadmap_public_links,
                       roadmap_checkpoints, roadmap_versions,
                       variable_versions, variables,
                       transcription_jobs,
                       summary_task_platforms, summary_task_drafts,
                       project_tasks, summaries,
                       doc_pages, chronicle_entries, environment_domains, domains, environments,
                       project_tags, tags,
                       model_services,
                       servers, projects, users, subjects
        RESTART IDENTITY CASCADE
      `);
    },
  };
}
