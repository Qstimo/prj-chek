import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Миграция, сводящая адрес окружения к единственному полю — списку доменов. */
const HOST_MIGRATION = '0021_environment_host_into_domains';

const DRIZZLE_DIR = resolve(__dirname, '../drizzle');

interface JournalEntry {
  tag: string;
}

/**
 * Перенос адреса окружения в домены.
 *
 * Два поля об одном и том же расходились по смыслу: домены попадали в реестр
 * и под проверки сроков, а адрес не попадал никуда. Перенос выполняется один
 * раз на живой базе, поэтому проверяется данными: доменное имя становится
 * доменом с корнем, а всё, что доменом не является, сохраняется в заметках —
 * терять введённое молча нельзя.
 */
describe('перенос адреса окружения в домены', () => {
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

    const boundary = journal.entries.findIndex((entry) => entry.tag === HOST_MIGRATION);

    for (const entry of journal.entries.slice(0, boundary)) {
      await applyMigration(client, entry.tag);
    }

    await seedLegacyHosts(client);

    for (const entry of journal.entries.slice(boundary)) {
      await applyMigration(client, entry.tag);
    }
  });

  afterAll(async () => {
    await client.end();
    await container.stop();
  });

  it('превращает доменный адрес в домен окружения', async () => {
    const rows = await client`
      SELECT d.name FROM environment_domains d
      JOIN environments e ON e.id = d.environment_id
      WHERE e.name = 'Прод' ORDER BY d.name
    `;

    expect(rows.map((row) => row.name)).toEqual(['prod.example.com']);
  });

  it('заводит корень перенесённого адреса в реестре', async () => {
    const rows = await client`
      SELECT r.name FROM environment_domains d
      JOIN domains r ON r.id = d.domain_id
      JOIN environments e ON e.id = d.environment_id
      WHERE e.name = 'Прод'
    `;

    expect(rows.map((row) => row.name)).toEqual(['example.com']);
  });

  it('не создаёт дубль, если такой домен уже вписан', async () => {
    const rows = await client`
      SELECT d.name FROM environment_domains d
      JOIN environments e ON e.id = d.environment_id
      WHERE e.name = 'Стейдж' ORDER BY d.name
    `;

    expect(rows.map((row) => row.name)).toEqual(['stage.example.com']);
  });

  it('сохраняет в заметках адрес, который доменом не является', async () => {
    const [row] = await client`SELECT notes FROM environments WHERE name = 'Разработка'`;

    expect(row?.notes).toContain('10.0.0.5:8080');
    // Прежние заметки остаются: перенос дописывает, а не затирает.
    expect(row?.notes).toContain('Локальный стенд');
  });

  it('убирает поле адреса из таблицы', async () => {
    const rows = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'environments' AND column_name = 'host'
    `;

    expect(rows).toEqual([]);
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

/** Готовит окружения в том виде, в каком они существовали до переноса. */
async function seedLegacyHosts(client: postgres.Sql): Promise<void> {
  const [project] = await client`
    INSERT INTO projects (name, slug, lifecycle) VALUES ('Витрина', 'vitrina', 'active') RETURNING id
  `;

  // Адрес доменом — переносится в домены.
  await client`
    INSERT INTO environments (project_id, name, kind, host)
    VALUES (${project!.id}, 'Прод', 'production', 'PROD.example.com ')
  `;

  // Адрес уже вписан доменом — переноситься нечему.
  const [staging] = await client`
    INSERT INTO environments (project_id, name, kind, host)
    VALUES (${project!.id}, 'Стейдж', 'staging', 'stage.example.com') RETURNING id
  `;
  const [root] = await client`INSERT INTO domains (name) VALUES ('example.com') RETURNING id`;
  await client`
    INSERT INTO environment_domains (environment_id, name, domain_id)
    VALUES (${staging!.id}, 'stage.example.com', ${root!.id})
  `;

  // Адрес не домен — уходит в заметки.
  await client`
    INSERT INTO environments (project_id, name, kind, host, notes)
    VALUES (${project!.id}, 'Разработка', 'development', '10.0.0.5:8080', 'Локальный стенд')
  `;
}
