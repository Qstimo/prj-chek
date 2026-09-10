import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Миграция, привязывающая домены окружений к корням реестра. */
const DOMAINS_MIGRATION = '0019_domains';

const DRIZZLE_DIR = resolve(__dirname, '../drizzle');

interface JournalEntry {
  tag: string;
}

/**
 * Проверка привязки существующих доменов к корням.
 *
 * Перенос выполняется один раз на живой базе, а правило корня написано
 * на SQL отдельно от `rootDomainOf` — значит их согласие нужно проверить
 * данными, а не глазами.
 */
describe('привязка доменов окружений к корням', () => {
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

    const boundary = journal.entries.findIndex((entry) => entry.tag === DOMAINS_MIGRATION);

    for (const entry of journal.entries.slice(0, boundary)) {
      await applyMigration(client, entry.tag);
    }

    await seedLegacyDomains(client);

    for (const entry of journal.entries.slice(boundary)) {
      await applyMigration(client, entry.tag);
    }
  });

  afterAll(async () => {
    await client.end();
    await container.stop();
  });

  it('заводит по корню на каждое оплачиваемое имя', async () => {
    const rows = await client`SELECT name FROM domains ORDER BY name`;

    expect(rows.map((row) => row.name)).toEqual(['example.com', 'shop.co.uk']);
  });

  it('сводит поддомены одного корня к одной записи', async () => {
    const rows = await client`
      SELECT e.name, d.name AS root
      FROM environment_domains e JOIN domains d ON d.id = e.domain_id
      ORDER BY e.name
    `;

    expect(rows).toEqual([
      { name: 'api.stage.shop.co.uk', root: 'shop.co.uk' },
      { name: 'example.com', root: 'example.com' },
      { name: 'stage.example.com', root: 'example.com' },
    ]);
  });

  it('делает корень обязательным', async () => {
    const [column] = await client`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'environment_domains' AND column_name = 'domain_id'
    `;

    expect(column?.is_nullable).toBe('NO');
  });

  it('убирает за собой временную функцию', async () => {
    const rows = await client`SELECT proname FROM pg_proc WHERE proname = 'cairn_root_domain'`;

    expect(rows).toEqual([]);
  });

  it('выдаёт роли приложения права на корни', async () => {
    const appClient = postgres(container.getConnectionUri(), {
      max: 1,
      user: 'cairn_app',
      password: 'test_app_password',
    });

    await expect(appClient`SELECT count(*) FROM domains`).resolves.toBeDefined();

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
 * Готовит домены в том виде, в каком они существовали до этапа 10:
 * корень, его поддомен и имя в зоне с регистрируемым именем третьего уровня.
 */
async function seedLegacyDomains(client: postgres.Sql): Promise<void> {
  const [project] = await client`
    INSERT INTO projects (name, slug, lifecycle) VALUES ('Витрина', 'vitrina', 'active') RETURNING id
  `;

  const [environment] = await client`
    INSERT INTO environments (project_id, name, kind)
    VALUES (${project!.id}, 'Прод', 'production') RETURNING id
  `;

  await client`
    INSERT INTO environment_domains (environment_id, name)
    VALUES
      (${environment!.id}, 'example.com'),
      (${environment!.id}, 'stage.example.com'),
      (${environment!.id}, 'api.stage.shop.co.uk')
  `;
}
