import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { ProjectsModule } from '../src/projects/projects.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('проекты по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let contractorSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AuthModule, ProjectsModule] })
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

    const passwords = new PasswordService();
    const passwordHash = await passwords.hash('очень длинный пароль');

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

    const [contractorSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    contractorSubjectId = contractorSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: contractorSubjectId, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект', purpose: 'Назначение' })
      .returning();
    projectId = project!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: contractorSubjectId,
      projectId,
      section: Section.Info,
      level,
      grantedBy: adminUserId,
    });
  }

  it('без доступа отвечает 404, а не 403', async () => {
    // Существование проекта не раскрывается (ТЗ 4.2).
    const agent = await signIn('user@cairn.local');

    await agent.get(`/projects/${projectId}`).expect(404);
  });

  it('отвечает одинаково для закрытого и несуществующего проекта', async () => {
    const agent = await signIn('user@cairn.local');

    const closed = await agent.get(`/projects/${projectId}`);
    const missing = await agent.get('/projects/00000000-0000-0000-0000-000000000000');

    expect(closed.status).toBe(missing.status);
  });

  it('не показывает закрытый проект в списке', async () => {
    const agent = await signIn('user@cairn.local');

    const response = await agent.get('/projects').expect(200);

    expect(response.body).toEqual([]);
  });

  it('на уровне метаданных не отдаёт назначение', async () => {
    await grant(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    const response = await agent.get(`/projects/${projectId}`).expect(200);

    expect(response.body).not.toHaveProperty('purpose');
  });

  it('на уровне чтения отдаёт назначение', async () => {
    await grant(AccessLevel.Read);
    const agent = await signIn('user@cairn.local');

    const response = await agent.get(`/projects/${projectId}`).expect(200);

    expect(response.body).toMatchObject({ purpose: 'Назначение' });
  });

  it('на уровне чтения запрещает правку с кодом 403', async () => {
    // Доступ есть, но уровень ниже нужного — отрицать существование нечего.
    await grant(AccessLevel.Read);
    const agent = await signIn('user@cairn.local');

    await agent.patch(`/projects/${projectId}`).send({ name: 'Новое имя' }).expect(403);
  });

  it('на уровне записи разрешает правку', async () => {
    await grant(AccessLevel.Write);
    const agent = await signIn('user@cairn.local');

    await agent.patch(`/projects/${projectId}`).send({ name: 'Новое имя' }).expect(200);

    const [updated] = await testDb.db.select().from(projects).where(eq(projects.id, projectId));

    expect(updated?.name).toBe('Новое имя');
  });

  it('создавать проект разрешает только суперадмину', async () => {
    await grant(AccessLevel.Write);
    const contractor = await signIn('user@cairn.local');

    await contractor.post('/projects').send({ name: 'Чужой' }).expect(403);
  });

  it('суперадмину разрешает создание', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin.post('/projects').send({ name: 'Новый проект' }).expect(201);
  });

  it('суперадмин видит все проекты без выдач', async () => {
    const admin = await signIn('admin@cairn.local');

    const response = await admin.get('/projects').expect(200);

    expect(response.body).toHaveLength(1);
  });

  it('без входа отвечает 401', async () => {
    await request(app.getHttpServer()).get('/projects').expect(401);
  });
});
