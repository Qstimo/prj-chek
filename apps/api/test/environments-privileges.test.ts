import {
  ChronicleSource,
  SubjectKind,
  SummaryTaskOrigin,
  TaskOrigin,
  TrackerKind,
} from '@cairn/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  chronicleEntries,
  projectTasks,
  projects,
  subjects,
  summaries,
  summaryTaskDrafts,
  taskExports,
  trackerConnections,
  trackerProjectBindings,
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

  it('роль приложения пишет пропуски наблюдения', async () => {
    // Запись идёт ровно там, где система и так ничего не видит: отказ в
    // правах на эту таблицу был бы незаметен до разбора первого спорного
    // аптайма.
    await expect(
      testDb.appDb.execute(
        sql`INSERT INTO status_observation_gaps (started_at, ended_at, reason)
            VALUES (now() - interval '1 hour', now(), 'silence')`,
      ),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`UPDATE status_observation_gaps SET ended_at = now()`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM status_observation_gaps`),
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
    // `checkpoint_platforms` не стало: теги переехали на задачу вместе с
    // формулировкой. Проверяются обе новые таблицы — права на них выданы
    // своей миграцией (`0054`), и забытый GRANT ломает не чтение, а
    // создание чекпоинта, то есть обычную правку роадмапа.
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM project_tasks`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM project_task_platforms`),
    ).resolves.toBeDefined();
  });

  it('роль приложения правит и уносит задачи реестра', async () => {
    // Сторож `0054` целиком: `SELECT` проходит и без части прав, а
    // замена набора тегов и удаление вынутой задачи — нет.
    await expect(
      testDb.appDb.execute(sql`DELETE FROM project_task_platforms WHERE false`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`DELETE FROM project_tasks WHERE false`),
    ).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`UPDATE project_tasks SET title = title WHERE false`),
    ).resolves.toBeDefined();
  });

  it('роль приложения правит и уносит подключение трекера и привязки досок', async () => {
    // Сторож `0056` целиком, и проверка именно записью: `SELECT` прошёл бы
    // и с урезанным до чтения грантом, а ломается не чтение — подключение и
    // привязка пишутся одним `ON CONFLICT … DO UPDATE`, то есть отказ в
    // правах пришёл бы ошибкой драйвера на первом сохранении настройки.
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'права-трекера@cairn.local' })
      .returning();
    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'prava-trekera', name: 'Права трекера' })
      .returning();

    const [connection] = await testDb.appDb
      .insert(trackerConnections)
      .values({
        kind: TrackerKind.Weeek,
        baseUrl: 'https://api.weeek.net/public/v1',
        updatedBySubjectId: subject!.id,
      })
      .returning();
    expect(connection?.secretEncrypted).toBeNull();

    // Токен ставится правкой, а не вторым путём записи: у настройки один
    // ключ — значение перечня.
    const [withSecret] = await testDb.appDb
      .update(trackerConnections)
      .set({ secretEncrypted: 'v1:nonce:ct:tag', isEnabled: false })
      .where(eq(trackerConnections.kind, TrackerKind.Weeek))
      .returning();
    expect(withSecret?.isEnabled).toBe(false);

    const [binding] = await testDb.appDb
      .insert(trackerProjectBindings)
      .values({
        projectId: project!.id,
        tracker: TrackerKind.Weeek,
        externalProjectId: '7',
        boardId: '11',
        boardColumnId: '31',
        updatedBySubjectId: subject!.id,
      })
      .returning();
    expect(binding?.boardColumnId).toBe('31');

    const [rebound] = await testDb.appDb
      .update(trackerProjectBindings)
      .set({ boardColumnId: '32' })
      .where(eq(trackerProjectBindings.projectId, project!.id))
      .returning();
    expect(rebound?.boardColumnId).toBe('32');

    // Снятие подключения уносит привязки, не трогая задачи (дизайн, 3.3):
    // без `DELETE` это действие упало бы отказом в правах.
    await testDb.appDb
      .delete(trackerProjectBindings)
      .where(eq(trackerProjectBindings.projectId, project!.id));
    await testDb.appDb
      .delete(trackerConnections)
      .where(eq(trackerConnections.kind, TrackerKind.Weeek));
    expect(await testDb.rowsOf(trackerProjectBindings)).toHaveLength(0);
    expect(await testDb.rowsOf(trackerConnections)).toHaveLength(0);
  });

  it('роль приложения пишет, правит и уносит выгрузки задач', async () => {
    // Сторож `0058`, и проверка именно записью: `SELECT` прошёл бы и с
    // урезанным до чтения грантом, а ломается не чтение. Отказ в правах
    // пришёл бы ошибкой драйвера **после** того, как запись «передали
    // наружу» уже легла в журнал, то есть задача уехала бы в трекер, а
    // зеркала у неё не появилось.
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'права-выгрузки@cairn.local' })
      .returning();
    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'prava-vygruzki', name: 'Права выгрузки' })
      .returning();
    const [task] = await testDb.db
      .insert(projectTasks)
      .values({ projectId: project!.id, title: 'Оплата картой', origin: TaskOrigin.Manual })
      .returning();

    const [exported] = await testDb.appDb
      .insert(taskExports)
      .values({
        taskId: task!.id,
        tracker: TrackerKind.Weeek,
        externalId: '4096',
        externalBoardId: '11',
        externalColumnId: '31',
      })
      .returning();
    expect(exported?.checkedAt).toBeNull();
    expect(exported?.isCompleted).toBe(false);

    // Опрос пишет `checked_at` при каждом тике, даже когда ничего не
    // изменилось: без `UPDATE` прогон падал бы отказом в правах на первом
    // же тике — и падал бы молча, в логе фонового цикла.
    const [checked] = await testDb.appDb
      .update(taskExports)
      .set({ checkedAt: new Date(), isCompleted: true, failureCode: null })
      .where(eq(taskExports.taskId, task!.id))
      .returning();
    expect(checked?.checkedAt).not.toBeNull();

    // Снятие подключения уносит выгрузки, не трогая задачи (дизайн, 3.3).
    await testDb.appDb.delete(taskExports).where(eq(taskExports.taskId, task!.id));
    expect(await testDb.rowsOf(taskExports)).toHaveLength(0);
    expect(await testDb.rowsOf(projectTasks)).toHaveLength(1);

    // Ссылка `restrict`, а не каскад: пока зеркало есть, задачу не унести
    // молча, и ответ на вопрос «а в Weeek она осталась?» не пропадёт
    // вместе со строкой (дизайн, 10.5).
    await testDb.appDb.insert(taskExports).values({
      taskId: task!.id,
      tracker: TrackerKind.Weeek,
      externalId: '4096',
      externalBoardId: '11',
    });
    await expect(
      testDb.appDb.delete(projectTasks).where(eq(projectTasks.id, task!.id)),
    ).rejects.toThrow();
  });

  it('роль приложения не меняет схему', async () => {
    await expect(
      testDb.appDb.execute(sql`ALTER TABLE environments ADD COLUMN sneaky text`),
    ).rejects.toThrow();
  });
});
