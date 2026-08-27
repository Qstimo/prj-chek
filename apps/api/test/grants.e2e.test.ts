import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { GrantsModule } from '../src/grants/grants.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('выдачи доступа по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let contractorSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AuthModule, GrantsModule] })
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
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  it('суперадмин выдаёт доступ', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Info, level: AccessLevel.Read })
      .expect(200);

    expect(await testDb.db.select().from(grants)).toHaveLength(1);
    expect(adminUserId).toBeDefined();
  });

  it('суперадмин отзывает доступ', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Info, level: AccessLevel.Read })
      .expect(200);

    await admin
      .delete(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Info })
      .expect(204);

    expect(await testDb.db.select().from(grants)).toHaveLength(0);
  });

  it('не-суперадмину отказывает с кодом 403', async () => {
    // Существование раздела администрирования секретом не является (спека 8).
    const contractor = await signIn('user@cairn.local');

    await contractor.get(`/projects/${projectId}/grants`).expect(403);
  });

  it('не позволяет субъекту с уровнем записи управлять выдачами', async () => {
    // Иначе владелец доступа расширил бы его себе сам (спека 4.3).
    await testDb.db.insert(grants).values({
      subjectId: contractorSubjectId,
      projectId,
      section: Section.Info,
      level: AccessLevel.Write,
      grantedBy: adminUserId,
    });
    const contractor = await signIn('user@cairn.local');

    await contractor
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Docs, level: AccessLevel.Write })
      .expect(403);
  });

  it('возвращает матрицу доступов', async () => {
    const admin = await signIn('admin@cairn.local');
    await admin
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Info, level: AccessLevel.Read })
      .expect(200);

    const response = await admin.get(`/projects/${projectId}/grants`).expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].levels[Section.Info]).toBe(AccessLevel.Read);
  });

  it('отвергает неизвестную секцию', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: 'выдумка', level: AccessLevel.Read })
      .expect(400);
  });

  it('без входа отвечает 401', async () => {
    await request(app.getHttpServer()).get(`/projects/${projectId}/grants`).expect(401);
  });
});
