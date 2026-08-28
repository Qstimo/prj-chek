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

describe('HTTP: документация', () => {
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
      section: Section.Docs,
      level,
      grantedBy: adminUserId,
    });
  }

  const PAGE = { title: 'Развёртывание', content: '# Шаги\n\nСекретные подробности.' };
  const base = () => `/projects/${projectId}/docs`;

  it('создаёт страницу и возвращает содержимое', async () => {
    const agent = await signIn('admin@cairn.local');

    const response = await agent.post(base()).send(PAGE).expect(201);

    expect(response.body).toMatchObject({ title: 'Развёртывание' });
    expect(response.body.content).toContain('Секретные подробности');
  });

  it('на уровне метаданных содержимое скрыто', async () => {
    const admin = await signIn('admin@cairn.local');
    await admin.post(base()).send(PAGE);

    await grantLevel(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    const list = await agent.get(base()).expect(200);
    expect(list.body[0]).toMatchObject({ title: 'Развёртывание' });
    expect(JSON.stringify(list.body)).not.toContain('Секретные подробности');
  });

  it('правка с уровнем чтения отвечает 403, без выдачи — 404', async () => {
    const admin = await signIn('admin@cairn.local');
    const created = await admin.post(base()).send(PAGE);

    const noAccess = await signIn('user@cairn.local');
    await noAccess.get(base()).expect(404);

    await grantLevel(AccessLevel.Read);
    const reader = await signIn('user@cairn.local');
    await reader.patch(`${base()}/${created.body.id}`).send({ title: 'Новое' }).expect(403);
  });

  it('повторный заголовок отклоняется', async () => {
    const agent = await signIn('admin@cairn.local');
    await agent.post(base()).send(PAGE).expect(201);

    const response = await agent.post(base()).send(PAGE);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('удаляет страницу', async () => {
    const agent = await signIn('admin@cairn.local');
    const created = await agent.post(base()).send(PAGE);

    await agent.delete(`${base()}/${created.body.id}`).expect(204);
    expect((await agent.get(base())).body).toHaveLength(0);
  });

  it('требует входа', async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
  });
});
