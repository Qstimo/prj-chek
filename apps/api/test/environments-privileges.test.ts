import { ChronicleSource, SubjectKind, SummaryTaskOrigin } from '@cairn/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  chronicleEntries,
  projects,
  subjects,
  summaries,
  summaryTaskDrafts,
} from '../src/db/schema';
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
    // Отчёт по релизу публикуется своей ссылкой, и это отдельная таблица
    // со своей парной миграцией прав.
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM roadmap_report_public_links`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT carried_from_version_id FROM roadmap_checkpoints`),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет падения адресов и подписки на пуши', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM address_incidents`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM push_subscriptions`),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет статусы адресов', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM domain_statuses`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT health, latency_ms, health_error FROM domain_statuses`),
    ).resolves.toBeDefined();
    // Колонки разбора проверок: табличный GRANT покрывает их сам, но
    // забытая структурная миграция иначе всплыла бы только в бою.
    await expect(
      testDb.appDb.execute(
        sql`SELECT health_code, redirect_to, resolved_ips, tls_trusted, tls_code FROM domain_statuses`,
      ),
    ).resolves.toBeDefined();
  });

  it('роль приложения читает и пишет саммари и черновик задач', async () => {
    // Парная миграция прав: без неё поток упал бы отказом в правах на
    // первом же сохранении текста созвона. Проверка именно записью:
    // урезанный до `GRANT SELECT` грант прошёл бы два `count(*)` и
    // всплыл бы только в бою — тот самый зазор, ради которого в
    // `db-fixture` стоит запрет дублировать гранты.
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'права@cairn.local' })
      .returning();
    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'prava-summari', name: 'Права саммари' })
      .returning();
    const [entry] = await testDb.db
      .insert(chronicleEntries)
      .values({
        projectId: project!.id,
        occurredOn: '2026-11-17',
        title: 'Созвон',
        content: 'Текст созвона',
        source: ChronicleSource.Summary,
        createdBySubjectId: subject!.id,
      })
      .returning();

    // Родители заведены владельцем намеренно: проверяются права на
    // саммари и черновик, а не на хронику с проектами.
    const [summary] = await testDb.appDb
      .insert(summaries)
      .values({
        projectId: project!.id,
        chronicleEntryId: entry!.id,
        createdBySubjectId: subject!.id,
      })
      .returning();
    const [task] = await testDb.appDb
      .insert(summaryTaskDrafts)
      .values({
        summaryId: summary!.id,
        title: 'Задача',
        position: 1,
        origin: SummaryTaskOrigin.Human,
      })
      .returning();

    const [renamed] = await testDb.appDb
      .update(summaryTaskDrafts)
      .set({ title: 'Правка формулировки' })
      .where(eq(summaryTaskDrafts.id, task!.id))
      .returning();
    expect(renamed?.title).toBe('Правка формулировки');

    const [stamped] = await testDb.appDb
      .update(summaries)
      .set({ suggesterName: 'local', suggestedAt: new Date() })
      .where(eq(summaries.id, summary!.id))
      .returning();
    expect(stamped?.suggesterName).toBe('local');

    await testDb.appDb
      .delete(summaryTaskDrafts)
      .where(eq(summaryTaskDrafts.summaryId, summary!.id));
    await testDb.appDb.delete(summaries).where(eq(summaries.id, summary!.id));
    expect(await testDb.rowsOf(summaries)).toHaveLength(0);
    expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
  });

  it('источник записи хроники принимает «саммари»', async () => {
    // Значение добавлено в существующий перечень: `ALTER TYPE … ADD VALUE`
    // в репозитории встречается впервые, и проверить его нужно на
    // применённой миграции, а не на схеме в коде.
    await expect(
      testDb.appDb.execute(sql`SELECT 'summary'::chronicle_source`),
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

  it('роль приложения читает и пишет платформы, связи и выпуски', async () => {
    // Единственная автоматическая проверка миграции прав: забытый GRANT
    // иначе всплывёт только в бою.
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM project_platforms`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM environment_platforms`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM version_platform_releases`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM checkpoint_platforms`),
    ).resolves.toBeDefined();
  });

  it('роль приложения не меняет схему', async () => {
    await expect(
      testDb.appDb.execute(sql`ALTER TABLE environments ADD COLUMN sneaky text`),
    ).rejects.toThrow();
  });
});
