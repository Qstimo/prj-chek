import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
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

describe('HTTP: окружения', () => {
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

  /** Входит и возвращает cookie сессии. */
  async function signIn(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'очень длинный пароль' });

    return response.headers['set-cookie'][0];
  }

  async function grantLevel(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: memberSubjectId,
      projectId,
      section: Section.Infrastructure,
      level,
      grantedBy: adminUserId,
    });
  }

  const PROD = {
    name: 'Прод',
    kind: EnvironmentKind.Production,
    ip: '203.0.113.10',
    domains: ['example.com'],
  };

  it('создаёт окружение и возвращает его', async () => {
    const cookie = await signIn('admin@cairn.local');

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', cookie)
      .send(PROD);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Прод', domains: ['example.com'] });
  });

  it('отвергает окружение без вида', async () => {
    const cookie = await signIn('admin@cairn.local');

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', cookie)
      .send({ name: 'Прод' });

    expect(response.status).toBe(400);
  });

  it('не раскрывает секцию субъекту без выдачи', async () => {
    const cookie = await signIn('user@cairn.local');

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/environments`)
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
  });

  it('на уровне метаданных не отдаёт IP', async () => {
    const adminCookie = await signIn('admin@cairn.local');
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', adminCookie)
      .send(PROD);

    await grantLevel(AccessLevel.Metadata);
    const cookie = await signIn('user@cairn.local');

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/environments`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ name: 'Прод', domains: ['example.com'] });
    expect(response.body[0].ip).toBeUndefined();
  });

  it('на уровне метаданных отказывает в правке кодом 403', async () => {
    // Доступ есть, но уровень ниже требуемого — существование объекта
    // уже не секрет (спека этапа 1, 5.3).
    const adminCookie = await signIn('admin@cairn.local');
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', adminCookie)
      .send(PROD);

    await grantLevel(AccessLevel.Metadata);
    const cookie = await signIn('user@cairn.local');

    const response = await request(app.getHttpServer())
      .patch(`/projects/${projectId}/environments/${created.body.id}`)
      .set('Cookie', cookie)
      .send({ provider: 'Hetzner' });

    expect(response.status).toBe(403);
  });

  it('удаляет окружение', async () => {
    const cookie = await signIn('admin@cairn.local');
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', cookie)
      .send(PROD);

    const response = await request(app.getHttpServer())
      .delete(`/projects/${projectId}/environments/${created.body.id}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(204);

    const list = await request(app.getHttpServer())
      .get(`/projects/${projectId}/environments`)
      .set('Cookie', cookie);

    expect(list.body).toHaveLength(0);
  });

  it('требует входа', async () => {
    const response = await request(app.getHttpServer()).get(
      `/projects/${projectId}/environments`,
    );

    expect(response.status).toBe(401);
  });
});
