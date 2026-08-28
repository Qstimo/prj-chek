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

describe('HTTP: хроника', () => {
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
      section: Section.Chronicle,
      level,
      grantedBy: adminUserId,
    });
  }

  const ENTRY = {
    occurredOn: '2026-08-27',
    title: 'Встреча по релизу',
    content: 'Решили выпускать в пятницу.',
  };

  it('создаёт запись и возвращает её', async () => {
    const agent = await signIn('admin@cairn.local');

    const response = await agent.post(`/projects/${projectId}/chronicle`).send(ENTRY);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ title: 'Встреча по релизу', source: 'manual' });
  });

  it('отвергает запись без заголовка', async () => {
    const agent = await signIn('admin@cairn.local');

    await agent
      .post(`/projects/${projectId}/chronicle`)
      .send({ occurredOn: '2026-08-27', content: 'Текст' })
      .expect(400);
  });

  it('не раскрывает секцию субъекту без выдачи', async () => {
    const agent = await signIn('user@cairn.local');

    await agent.get(`/projects/${projectId}/chronicle`).expect(404);
  });

  it('на уровне метаданных не отдаёт содержимого', async () => {
    const admin = await signIn('admin@cairn.local');
    await admin.post(`/projects/${projectId}/chronicle`).send(ENTRY);

    await grantLevel(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    const response = await agent.get(`/projects/${projectId}/chronicle`).expect(200);

    expect(response.body[0]).toMatchObject({ title: 'Встреча по релизу' });
    expect(response.body[0].content).toBeUndefined();
  });

  it('на уровне метаданных отказывает в правке кодом 403', async () => {
    const admin = await signIn('admin@cairn.local');
    const created = await admin.post(`/projects/${projectId}/chronicle`).send(ENTRY);

    await grantLevel(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    await agent
      .patch(`/projects/${projectId}/chronicle/${created.body.id}`)
      .send({ title: 'Новый' })
      .expect(403);
  });

  it('удаляет запись', async () => {
    const agent = await signIn('admin@cairn.local');
    const created = await agent.post(`/projects/${projectId}/chronicle`).send(ENTRY);

    await agent.delete(`/projects/${projectId}/chronicle/${created.body.id}`).expect(204);

    const list = await agent.get(`/projects/${projectId}/chronicle`).expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('требует входа', async () => {
    await request(app.getHttpServer()).get(`/projects/${projectId}/chronicle`).expect(401);
  });
});
