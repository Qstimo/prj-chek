import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
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

    it('мусорный токен отвечает 404', async () => {
      await request(app.getHttpServer()).get('/public/roadmap/мусор').expect(404);
    });
  });

  it('требует входа на секции', async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
  });
});
