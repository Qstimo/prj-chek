import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('HTTP: роадмап', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let memberSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const passwordHash = await new PasswordService().hash('очень длинный пароль');

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash,
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [memberSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    memberSubjectId = memberSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: memberSubjectId, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  async function grantLevel(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: memberSubjectId,
      projectId,
      section: Section.Roadmap,
      level,
      grantedBy: adminUserId,
    });
  }

  const base = () => `/projects/${projectId}/roadmap`;

  it('создаёт версию и отдаёт роадмап со стадией', async () => {
    const agent = await signIn('admin@cairn.local');

    await agent.post(`${base()}/versions`).send({ label: 'v1.0' }).expect(201);

    const roadmap = await agent.get(base()).expect(200);
    expect(roadmap.body.stage).toEqual({ current: 1, total: 1 });
    expect(roadmap.body.versions[0]).toMatchObject({ label: 'v1.0', progress: { done: 0, total: 0 } });
  });

  it('чекпоинты меняют прогресс через PATCH', async () => {
    const agent = await signIn('admin@cairn.local');
    const version = await agent.post(`${base()}/versions`).send({ label: 'v1.0' });

    const checkpoint = await agent
      .post(`${base()}/versions/${version.body.id}/checkpoints`)
      .send({ title: 'Готов вход' })
      .expect(201);
    await agent
      .patch(`${base()}/versions/${version.body.id}/checkpoints/${checkpoint.body.id}`)
      .send({ isDone: true })
      .expect(200);

    const roadmap = await agent.get(base()).expect(200);
    expect(roadmap.body.versions[0].progress).toEqual({ done: 1, total: 1 });
  });

  it('на уровне метаданных формулировки скрыты', async () => {
    const admin = await signIn('admin@cairn.local');
    const version = await admin.post(`${base()}/versions`).send({ label: 'v1.0' });
    await admin
      .post(`${base()}/versions/${version.body.id}/checkpoints`)
      .send({ title: 'Секретная формулировка' });

    await grantLevel(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    const roadmap = await agent.get(base()).expect(200);
    expect(JSON.stringify(roadmap.body)).not.toContain('Секретная формулировка');
    expect(roadmap.body.versions[0].progress).toEqual({ done: 0, total: 1 });
  });

  it('правка с уровнем чтения отвечает 403', async () => {
    const admin = await signIn('admin@cairn.local');
    const version = await admin.post(`${base()}/versions`).send({ label: 'v1.0' });

    await grantLevel(AccessLevel.Read);
    const agent = await signIn('user@cairn.local');

    await agent
      .patch(`${base()}/versions/${version.body.id}`)
      .send({ label: 'v2.0' })
      .expect(403);
  });

  it('без выдачи секция отвечает 404', async () => {
    const agent = await signIn('user@cairn.local');

    await agent.get(base()).expect(404);
  });

  describe('перенос чекпоинта', () => {
    /** Версия с одним чекпоинтом: перенос всегда начинается с них. */
    async function versionWithCheckpoint(
      agent: Awaited<ReturnType<typeof signIn>>,
      label: string,
    ): Promise<{ versionId: string; checkpointId: string }> {
      const version = await agent.post(`${base()}/versions`).send({ label }).expect(201);
      const checkpoint = await agent
        .post(`${base()}/versions/${version.body.id}/checkpoints`)
        .send({ title: 'Оплата' })
        .expect(201);

      return { versionId: version.body.id, checkpointId: checkpoint.body.id };
    }

    const carryOver = (versionId: string, checkpointId: string) =>
      `${base()}/versions/${versionId}/checkpoints/${checkpointId}/carry-over`;

    it('переносит в указанную версию', async () => {
      const agent = await signIn('admin@cairn.local');
      const { versionId, checkpointId } = await versionWithCheckpoint(agent, 'v1.2');
      const target = await agent.post(`${base()}/versions`).send({ label: 'v1.3' }).expect(201);

      const moved = await agent
        .post(carryOver(versionId, checkpointId))
        .send({ targetVersionId: target.body.id })
        .expect(201);

      expect(moved.body.targetVersion).toMatchObject({ id: target.body.id, label: 'v1.3' });
      expect(moved.body.versionCreated).toBe(false);

      const roadmap = await agent.get(base()).expect(200);
      expect(roadmap.body.versions[0]).toMatchObject({ label: 'v1.2', unfinished: 0 });
      expect(roadmap.body.versions[1]).toMatchObject({ label: 'v1.3', unfinished: 1 });
    });

    it('пустое тело едет в следующую открытую версию', async () => {
      const agent = await signIn('admin@cairn.local');
      const { versionId, checkpointId } = await versionWithCheckpoint(agent, 'v1.2');
      await agent.post(`${base()}/versions`).send({ label: 'v1.3' }).expect(201);
      await agent
        .patch(`${base()}/versions/${versionId}`)
        .send({ state: 'released' })
        .expect(200);

      const moved = await agent.post(carryOver(versionId, checkpointId)).expect(201);

      expect(moved.body.targetVersion.label).toBe('v1.3');
    });

    it('без открытой версии отвечает 409 с различимым кодом', async () => {
      const agent = await signIn('admin@cairn.local');
      const { versionId, checkpointId } = await versionWithCheckpoint(agent, 'v1.2');
      await agent
        .patch(`${base()}/versions/${versionId}`)
        .send({ state: 'released' })
        .expect(200);

      const refused = await agent.post(carryOver(versionId, checkpointId)).expect(409);

      // По коду веб спрашивает обозначение и повторяет перенос.
      expect(refused.body.code).toBe('carry_over_needs_label');

      const created = await agent
        .post(carryOver(versionId, checkpointId))
        .send({ newVersionLabel: 'v1.3' })
        .expect(201);

      expect(created.body.versionCreated).toBe(true);
      expect(created.body.targetVersion.label).toBe('v1.3');
    });

    it('обе формы сразу — 400', async () => {
      const agent = await signIn('admin@cairn.local');
      const { versionId, checkpointId } = await versionWithCheckpoint(agent, 'v1.2');
      const target = await agent.post(`${base()}/versions`).send({ label: 'v1.3' }).expect(201);

      await agent
        .post(carryOver(versionId, checkpointId))
        .send({ targetVersionId: target.body.id, newVersionLabel: 'v1.4' })
        .expect(400);
    });

    it('перенос с уровнем чтения отвечает 403', async () => {
      const admin = await signIn('admin@cairn.local');
      const { versionId, checkpointId } = await versionWithCheckpoint(admin, 'v1.2');
      const target = await admin.post(`${base()}/versions`).send({ label: 'v1.3' }).expect(201);

      await grantLevel(AccessLevel.Read);
      const agent = await signIn('user@cairn.local');

      await agent
        .post(carryOver(versionId, checkpointId))
        .send({ targetVersionId: target.body.id })
        .expect(403);
    });
  });

  describe('публичная ссылка', () => {
    it('суперадмин публикует, повторно — 409, не-суперадмин — 403', async () => {
      const admin = await signIn('admin@cairn.local');

      const published = await admin.post(`${base()}/public-link`).expect(201);
      expect(published.body.token.length).toBeGreaterThanOrEqual(32);
      expect(published.body.url).toContain(`/roadmap/${published.body.token}`);

      await admin.post(`${base()}/public-link`).expect(409);

      await grantLevel(AccessLevel.Write);
      const agent = await signIn('user@cairn.local');
      await agent.post(`${base()}/public-link`).expect(403);
    });

    it('читающий видит ссылку, без публикации — 404', async () => {
      await grantLevel(AccessLevel.Read);
      const agent = await signIn('user@cairn.local');

      await agent.get(`${base()}/public-link`).expect(404);

      const admin = await signIn('admin@cairn.local');
      await admin.post(`${base()}/public-link`).expect(201);

      await agent.get(`${base()}/public-link`).expect(200);
    });

    it('публичный роадмап читается без сессии и гаснет после отключения', async () => {
      const admin = await signIn('admin@cairn.local');
      const version = await admin.post(`${base()}/versions`).send({ label: 'v1.0' });
      await admin
        .post(`${base()}/versions/${version.body.id}/checkpoints`)
        .send({ title: 'Публичная формулировка' });
      const published = await admin.post(`${base()}/public-link`).expect(201);

      const response = await request(app.getHttpServer())
        .get(`/public/roadmap/${published.body.token}`)
        .expect(200);
      expect(response.body.projectName).toBe('Проект');
      expect(JSON.stringify(response.body)).toContain('Публичная формулировка');

      await admin.delete(`${base()}/public-link`).expect(204);
      await request(app.getHttpServer())
        .get(`/public/roadmap/${published.body.token}`)
        .expect(404);
    });

    it('публичный ответ не содержит ссылки на задачу', async () => {
      // Негативная проверка на уровне HTTP, а не только проекции:
      // страница открыта без авторизации, и адрес внутреннего трекера с
      // номером задачи наружу уходить не должен ни при какой сборке
      // ответа (инвариант дизайна 1).
      const admin = await signIn('admin@cairn.local');
      const version = await admin.post(`${base()}/versions`).send({ label: 'v1.0' }).expect(201);
      await admin
        .post(`${base()}/versions/${version.body.id}/checkpoints`)
        .send({ title: 'Оплата', url: 'https://tracker.example.com/TASK-17' })
        .expect(201);
      const published = await admin.post(`${base()}/public-link`).expect(201);

      // Внутри ссылка на месте: гасится именно публичный путь.
      const inside = await admin.get(base()).expect(200);
      expect(JSON.stringify(inside.body)).toContain('tracker.example.com');

      const response = await request(app.getHttpServer())
        .get(`/public/roadmap/${published.body.token}`)
        .expect(200);

      expect(response.body.versions[0].checkpoints[0]).not.toHaveProperty('url');
      expect(JSON.stringify(response.body)).not.toContain('tracker.example.com');
      expect(JSON.stringify(response.body)).not.toContain('TASK-17');
    });

    it('мусорный токен отвечает 404', async () => {
      await request(app.getHttpServer()).get('/public/roadmap/мусор').expect(404);
    });
  });

  describe('отчёт по релизу', () => {
    /** Версия с чекпоинтом и ссылкой на задачу: отчёт строится на них. */
    async function versionWithWork(
      agent: Awaited<ReturnType<typeof signIn>>,
    ): Promise<{ versionId: string }> {
      const version = await agent.post(`${base()}/versions`).send({ label: 'v1.2' }).expect(201);
      await agent
        .post(`${base()}/versions/${version.body.id}/checkpoints`)
        .send({ title: 'Оплата', url: 'https://tracker.example.com/TASK-17' })
        .expect(201);

      return { versionId: version.body.id };
    }

    const report = (versionId: string) => `${base()}/versions/${versionId}/report`;

    it('читающий получает отчёт с готовым текстом', async () => {
      const admin = await signIn('admin@cairn.local');
      const { versionId } = await versionWithWork(admin);

      await grantLevel(AccessLevel.Read);
      const agent = await signIn('user@cairn.local');

      const response = await agent.get(report(versionId)).expect(200);

      expect(response.body.version).toMatchObject({ label: 'v1.2' });
      expect(response.body.checkpoints[0]).toMatchObject({ title: 'Оплата' });
      expect(response.body.markdown).toContain('Отчёт по релизу v1.2');
      expect(response.body.text).toContain('Оплата');
    });

    it('уровня метаданных на отчёт не хватает, без выдачи — 404', async () => {
      const admin = await signIn('admin@cairn.local');
      const { versionId } = await versionWithWork(admin);

      const agent = await signIn('user@cairn.local');
      await agent.get(report(versionId)).expect(404);

      await grantLevel(AccessLevel.Metadata);
      const withMetadata = await signIn('user@cairn.local');
      await withMetadata.get(report(versionId)).expect(403);
    });

    it('суперадмин публикует, повторно — 409, не-суперадмин — 403', async () => {
      const admin = await signIn('admin@cairn.local');
      const { versionId } = await versionWithWork(admin);

      const published = await admin.post(`${report(versionId)}/public-link`).expect(201);
      expect(published.body.token.length).toBeGreaterThanOrEqual(32);
      expect(published.body.url).toContain(`/roadmap/report/${published.body.token}`);

      await admin.post(`${report(versionId)}/public-link`).expect(409);

      await grantLevel(AccessLevel.Write);
      const agent = await signIn('user@cairn.local');
      await agent.post(`${report(versionId)}/public-link`).expect(403);
    });

    it('читающий видит ссылку, без публикации — 404', async () => {
      const admin = await signIn('admin@cairn.local');
      const { versionId } = await versionWithWork(admin);

      await grantLevel(AccessLevel.Read);
      const agent = await signIn('user@cairn.local');

      await agent.get(`${report(versionId)}/public-link`).expect(404);

      await admin.post(`${report(versionId)}/public-link`).expect(201);

      await agent.get(`${report(versionId)}/public-link`).expect(200);
    });

    it('публичный отчёт читается без сессии и гаснет после отключения', async () => {
      const admin = await signIn('admin@cairn.local');
      const { versionId } = await versionWithWork(admin);
      const published = await admin.post(`${report(versionId)}/public-link`).expect(201);

      const response = await request(app.getHttpServer())
        .get(`/public/roadmap-report/${published.body.token}`)
        .expect(200);
      expect(response.body.projectName).toBe('Проект');
      expect(response.body.version.label).toBe('v1.2');

      await admin.delete(`${report(versionId)}/public-link`).expect(204);
      await request(app.getHttpServer())
        .get(`/public/roadmap-report/${published.body.token}`)
        .expect(404);
    });

    it('публичный отчёт не содержит ссылки на задачу', async () => {
      // Негативная проверка на уровне HTTP, а не только проекции:
      // страница открыта без авторизации, и адрес внутреннего трекера с
      // номером задачи наружу уходить не должен ни при какой сборке
      // ответа (инвариант дизайна 1).
      const admin = await signIn('admin@cairn.local');
      const { versionId } = await versionWithWork(admin);
      const published = await admin.post(`${report(versionId)}/public-link`).expect(201);

      // Внутри ссылка на месте: гасится именно публичный путь.
      const inside = await admin.get(report(versionId)).expect(200);
      expect(JSON.stringify(inside.body)).toContain('tracker.example.com');

      const response = await request(app.getHttpServer())
        .get(`/public/roadmap-report/${published.body.token}`)
        .expect(200);

      expect(response.body.checkpoints[0]).not.toHaveProperty('url');
      expect(JSON.stringify(response.body)).not.toContain('tracker.example.com');
      expect(JSON.stringify(response.body)).not.toContain('TASK-17');
    });

    it('мусорный токен отчёта отвечает 404', async () => {
      await request(app.getHttpServer()).get('/public/roadmap-report/мусор').expect(404);
    });

    it('ссылка роадмапа отчёт не открывает', async () => {
      // Токены живут в разных таблицах: один не годится для двух выдач.
      const admin = await signIn('admin@cairn.local');
      await versionWithWork(admin);
      const roadmapLink = await admin.post(`${base()}/public-link`).expect(201);

      await request(app.getHttpServer())
        .get(`/public/roadmap-report/${roadmapLink.body.token}`)
        .expect(404);
    });

    it('требует входа', async () => {
      const admin = await signIn('admin@cairn.local');
      const { versionId } = await versionWithWork(admin);

      await request(app.getHttpServer()).get(report(versionId)).expect(401);
    });

    it('роль приложения имеет права на таблицу ссылок', async () => {
      // Забытый GRANT иначе всплыл бы только в бою: тесты ходят в базу
      // владельцем, и отказ в правах роли приложения они не заметят.
      // Права выдаёт миграция из репозитория, а не фикстура.
      await expect(
        testDb.appDb.execute(sql`SELECT count(*) FROM roadmap_report_public_links`),
      ).resolves.toBeDefined();
    });
  });

  it('требует входа на секции', async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
  });
});
