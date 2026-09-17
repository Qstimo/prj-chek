import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Миграция, сводящая адрес проверки к доменам окружения. */
const HEALTH_MIGRATION = '0023_health_by_address';

const DRIZZLE_DIR = resolve(__dirname, '../drizzle');

interface JournalEntry {
  tag: string;
}

/**
 * Перенос адреса health-проверки в домены окружения.
 *
 * Полный URL был вторым местом, где жил адрес: HTTP-проверка ходила на один
 * хост, TLS — на другой, и оба результата попадали в один индикатор. Перенос
 * выполняется один раз на живой базе, поэтому проверяется данными: путь
 * остаётся путём, хост становится адресом окружения, а всё, что доменом не
 * является, сохраняется в заметках — терять введённое молча нельзя.
 */
describe('перенос адреса проверки в домены окружения', () => {
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

    const boundary = journal.entries.findIndex((entry) => entry.tag === HEALTH_MIGRATION);

    for (const entry of journal.entries.slice(0, boundary)) {
      await applyMigration(client, entry.tag);
    }

    await seedLegacyHealthUrls(client);

    for (const entry of journal.entries.slice(boundary)) {
      await applyMigration(client, entry.tag);
    }
  });

  afterAll(async () => {
    await client.end();
    await container.stop();
  });

  it('переносит путь из адреса проверки', async () => {
    const [row] = await client`SELECT health_check_path FROM environments WHERE name = 'Прод'`;

    expect(row?.health_check_path).toBe('/api/health');
  });

  it('заводит хост проверки адресом окружения', async () => {
    // Хост и был адресом — просто вписанным не туда.
    const rows = await client`
      SELECT d.name FROM environment_domains d
      JOIN environments e ON e.id = d.environment_id
      WHERE e.name = 'Прод' ORDER BY d.name
    `;

    expect(rows.map((row) => row.name)).toContain('prod.example.com');
  });

  it('заводит корень перенесённого хоста в реестре', async () => {
    const rows = await client`SELECT name FROM domains ORDER BY name`;

    expect(rows.map((row) => row.name)).toContain('example.com');
  });

  it('корень без пути оставляет путь пустым', async () => {
    const [row] = await client`SELECT health_check_path FROM environments WHERE name = 'Стейдж'`;

    expect(row?.health_check_path).toBeNull();
  });

  it('не создаёт дубль, если такой адрес уже вписан', async () => {
    const rows = await client`
      SELECT d.name FROM environment_domains d
      JOIN environments e ON e.id = d.environment_id
      WHERE e.name = 'Стейдж' ORDER BY d.name
    `;

    expect(rows.map((row) => row.name)).toEqual(['stage.example.com']);
  });

  it('хост, доменом не являющийся, сохраняет в заметках', async () => {
    const [row] = await client`
      SELECT notes, health_check_path FROM environments WHERE name = 'Стенд'
    `;

    expect(row?.notes).toContain('10.0.0.5:3000');
    // Прежние заметки остаются: перенос дописывает, а не затирает.
    expect(row?.notes).toContain('Временная машина');
    // Путь остаётся путём: ручка приложения одна на всех его адресах.
    expect(row?.health_check_path).toBe('/health');
  });

  it('убирает поле адреса проверки из таблицы', async () => {
    const rows = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'environments' AND column_name = 'health_check_url'
    `;

    expect(rows).toEqual([]);
  });

  it('оставляет одну таблицу статусов — по адресу', async () => {
    // Две таблицы с разными ключами могли описывать разные хосты.
    const rows = await client`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('environment_statuses', 'domain_statuses') ORDER BY table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual(['domain_statuses']);
  });

  it('держит здоровье адреса рядом с его сроками', async () => {
    const rows = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'domain_statuses' AND column_name IN ('health', 'latency_ms', 'health_error')
      ORDER BY column_name
    `;

    expect(rows.map((row) => row.column_name)).toEqual(['health', 'health_error', 'latency_ms']);
  });

  it('оставляет приложению право писать здоровье адреса', async () => {
    const rows = await client`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'cairn_app' AND table_name = 'domain_statuses'
        AND column_name = 'health' AND privilege_type = 'UPDATE'
    `;

    expect(rows).toHaveLength(1);
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
async function seedLegacyHealthUrls(client: postgres.Sql): Promise<void> {
  const [project] = await client`
    INSERT INTO projects (name, slug, lifecycle) VALUES ('Витрина', 'vitrina', 'active') RETURNING id
  `;

  // Хост доменный, адреса у окружения нет — переносится и хост, и путь.
  await client`
    INSERT INTO environments (project_id, name, kind, health_check_url)
    VALUES (${project!.id}, 'Прод', 'production', 'https://PROD.example.com/api/health')
  `;

  // Хост уже вписан адресом, пути нет — переноситься нечему.
  const [staging] = await client`
    INSERT INTO environments (project_id, name, kind, health_check_url)
    VALUES (${project!.id}, 'Стейдж', 'staging', 'https://stage.example.com') RETURNING id
  `;
  const [root] = await client`INSERT INTO domains (name) VALUES ('example.com') RETURNING id`;
  await client`
    INSERT INTO environment_domains (environment_id, name, domain_id)
    VALUES (${staging!.id}, 'stage.example.com', ${root!.id})
  `;

  // Хост доменом не является — уходит в заметки.
  await client`
    INSERT INTO environments (project_id, name, kind, health_check_url, notes)
    VALUES (${project!.id}, 'Стенд', 'other', 'http://10.0.0.5:3000/health', 'Временная машина')
  `;
}
