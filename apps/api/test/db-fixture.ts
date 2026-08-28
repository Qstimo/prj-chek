import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
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
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();

  const ownerClient = postgres(container.getConnectionUri(), { max: 1 });
  const db = drizzle(ownerClient, { schema });

  // Роль создаётся до миграций: миграция прав на неё ссылается.
  await db.execute(sql`CREATE ROLE cairn_app WITH LOGIN PASSWORD 'test_app_password'`);
  await db.execute(sql`GRANT USAGE ON SCHEMA public TO cairn_app`);

  await migrate(db, { migrationsFolder: './drizzle' });

  const appClient = postgres(container.getConnectionUri(), {
    max: 1,
    user: 'cairn_app',
    password: 'test_app_password',
  });

  return {
    db,
    appDb: drizzle(appClient, { schema }),
    stop: async () => {
      await appClient.end();
      await ownerClient.end();
      await container.stop();
    },
    truncate: async () => {
      await db.execute(sql`
        TRUNCATE TABLE audit_log, grants, sessions, invitations, totp_challenges,
                       roadmap_public_links, roadmap_checkpoints, roadmap_versions,
                       variable_versions, variables,
                       chronicle_entries, environment_domains, environments,
                       projects, users, subjects
        RESTART IDENTITY CASCADE
      `);
    },
  };
}
