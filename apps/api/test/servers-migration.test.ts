import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

/** Миграция, переносящая серверные поля окружений в таблицу серверов. */
const SERVERS_MIGRATION = '0017_servers';

/**
 * Последняя миграция этапа 9.
 *
 * Цепочка применяется не до конца намеренно: проверяется перенос этапа 9,
 * а более поздние миграции меняют схему дальше — этап 11, например, убирает
 * из окружений колонку адреса, и проверка переноса в неё упиралась бы.
 */
const LAST_STAGE_MIGRATION = '0018_server_privileges';

const DRIZZLE_DIR = resolve(__dirname, '../drizzle');

interface JournalEntry {
  tag: string;
}

/**
 * Проверка переноса данных существующего реестра.
 *
 * Единственный тест миграции в проекте, и он оправдан: перенос выполняется
 * один раз на живой базе, где ошибка означает потерянные IP и провайдеров.
 * Схему после переноса проверяют обычные тесты — здесь важны именно данные.
 */
describe('перенос серверных полей окружений в серверы', () => {
  let container: StartedPostgreSqlContainer;
  let client: postgres.Sql;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    client = postgres(container.getConnectionUri(), { max: 1 });

    await client.unsafe(`CREATE ROLE cairn_app WITH LOGIN PASSWORD 'test_app_password'`);
    await client.unsafe(`GRANT USAGE ON SCHEMA public TO cairn_app`);

    const journal = JSON.parse(
      await readFile(resolve(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8'),
    ) as { entries: JournalEntry[] };

    const boundary = journal.entries.findIndex((entry) => entry.tag === SERVERS_MIGRATION);

    for (const entry of journal.entries.slice(0, boundary)) {
      await applyMigration(client, entry.tag);
    }

    await seedLegacyEnvironments(client);

    // Всё, начиная с переноса: следом идёт выдача прав на серверы, и без
    // неё проверка привилегий проверяла бы не миграцию, а её отсутствие.
    const end = journal.entries.findIndex((entry) => entry.tag === LAST_STAGE_MIGRATION) + 1;

    for (const entry of journal.entries.slice(boundary, end)) {
      await applyMigration(client, entry.tag);
    }
  });

  afterAll(async () => {
    await client.end();
    await container.stop();
  });

  it('склеивает окружения с одинаковым адресом в один сервер, а разные адреса — в разные', async () => {
    const servers = await client`SELECT name, host, ip, provider FROM servers ORDER BY name`;

    expect(servers.map((server) => server.name)).toEqual([
      'demo.example.com',
      'fsn1.example.com',
    ]);
    expect(servers[1]).toMatchObject({
      host: 'fsn1.example.com',
      ip: '203.0.113.10',
      provider: 'Hetzner',
    });
  });

  it('привязывает к серверу окружения с адресом и оставляет без него безадресное', async () => {
    const rows = await client`
      SELECT e.name, s.name AS server_name
      FROM environments e LEFT JOIN servers s ON s.id = e.server_id
      ORDER BY e.name
    `;

    expect(rows).toEqual([
      { name: 'Дев', server_name: null },
      { name: 'Демо', server_name: 'demo.example.com' },
      { name: 'Прод', server_name: 'fsn1.example.com' },
      { name: 'Стейдж', server_name: 'fsn1.example.com' },
    ]);
  });

  it('не теряет расхождения характеристик, а переносит их в заметки', async () => {
    const [server] = await client`SELECT notes FROM servers WHERE name = 'fsn1.example.com'`;

    expect(server?.notes).toContain('из окружения «Стейдж»');
    expect(server?.notes).toContain('2 vCPU, 4 ГБ');
  });

  it('очищает адрес окружения, совпавший с адресом машины', async () => {
    const rows = await client`SELECT name, host FROM environments ORDER BY name`;

    expect(rows).toEqual([
      { name: 'Дев', host: null },
      { name: 'Демо', host: null },
      { name: 'Прод', host: null },
      { name: 'Стейдж', host: null },
    ]);
  });

  it('убирает из окружений колонки машины', async () => {
    const columns = await client`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'environments'
    `;
    const names = columns.map((column) => column.column_name);

    expect(names).not.toContain('ip');
    expect(names).not.toContain('provider');
    expect(names).not.toContain('specs');
    expect(names).toContain('server_id');
  });

  it('выдаёт роли приложения права на серверы', async () => {
    const appClient = postgres(container.getConnectionUri(), {
      max: 1,
      user: 'cairn_app',
      password: 'test_app_password',
    });

    await expect(appClient`SELECT count(*) FROM servers`).resolves.toBeDefined();

    await appClient.end();
  });
});

/** Применяет миграцию по её тегу, разбивая файл по разделителю drizzle. */
async function applyMigration(client: postgres.Sql, tag: string): Promise<void> {
  const file = await readFile(resolve(DRIZZLE_DIR, `${tag}.sql`), 'utf8');

  for (const statement of file.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();

    if (trimmed.length > 0) {
      await client.unsafe(trimmed);
    }
  }
}

/**
 * Готовит реестр в том виде, в каком он существовал до этапа 9: два окружения
 * на одной машине с разными характеристиками, окружение на другой машине
 * и окружение без адреса вовсе.
 */
async function seedLegacyEnvironments(client: postgres.Sql): Promise<void> {
  const [project] = await client`
    INSERT INTO projects (name, slug, lifecycle) VALUES ('Витрина', 'vitrina', 'active') RETURNING id
  `;

  await client`
    INSERT INTO environments (project_id, name, kind, host, ip, provider, specs, created_at)
    VALUES
      (${project!.id}, 'Прод', 'production', 'fsn1.example.com', '203.0.113.10', 'Hetzner', '4 vCPU, 8 ГБ', now() - interval '2 days'),
      (${project!.id}, 'Стейдж', 'staging', 'fsn1.example.com', NULL, 'Hetzner', '2 vCPU, 4 ГБ', now() - interval '1 day'),
      (${project!.id}, 'Демо', 'other', 'demo.example.com', NULL, 'Selectel', NULL, now()),
      (${project!.id}, 'Дев', 'development', NULL, NULL, NULL, NULL, now())
  `;
}
