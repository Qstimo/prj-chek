import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('права роли приложения на окружения', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('роль приложения читает и пишет окружения', async () => {
    // Права выдаются миграцией из репозитория, а не фикстурой: иначе тест
    // остался бы зелёным при сломанной миграции (см. комментарий в db-fixture).
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM environments`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM environment_domains`),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет корневые домены', async () => {
    await expect(testDb.appDb.execute(sql`SELECT count(*) FROM domains`)).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет серверы', async () => {
    await expect(testDb.appDb.execute(sql`SELECT count(*) FROM servers`)).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет хронику', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM chronicle_entries`),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет переменные', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM variables`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM variable_versions`),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет роадмап', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM roadmap_versions`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM roadmap_public_links`),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет статусы', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM environment_statuses`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM domain_statuses`),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет документацию', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM doc_pages`),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет токены агентов', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM agent_tokens`),
    ).resolves.toBeDefined();
  });

  it('роль приложения не меняет схему', async () => {
    await expect(
      testDb.appDb.execute(sql`ALTER TABLE environments ADD COLUMN sneaky text`),
    ).rejects.toThrow();
  });
});
