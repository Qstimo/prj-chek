import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { environments, grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('HTTP: переменные', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let environmentId: string;
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

    const [environment] = await testDb.db
      .insert(environments)
      .values({ projectId, name: 'Прод', kind: EnvironmentKind.Production })
      .returning();
    environmentId = environment!.id;
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
      section: Section.Variables,
      level,
      grantedBy: adminUserId,
    });
  }

  const base = () => `/projects/${projectId}/environments/${environmentId}/variables`;

  it('создаёт переменную и не возвращает значения', async () => {
    const agent = await signIn('admin@cairn.local');

    const response = await agent
      .post(base())
      .send({ key: 'DATABASE_URL', value: 'postgres://secret', description: 'Подключение' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ key: 'DATABASE_URL', currentVersion: 1 });
    expect(JSON.stringify(response.body)).not.toContain('postgres://secret');
  });

  it('раскрывает значение отдельным действием', async () => {
    const agent = await signIn('admin@cairn.local');
    const created = await agent.post(base()).send({ key: 'KEY', value: 'секретное' });

    const revealed = await agent.post(`${base()}/${created.body.id}/reveal`).expect(201);

    expect(revealed.body).toEqual({ value: 'секретное', versionNo: 1 });
  });

  it('на уровне метаданных раскрытие отвечает 403', async () => {
    const admin = await signIn('admin@cairn.local');
    const created = await admin.post(base()).send({ key: 'KEY', value: 'x' });

    await grantLevel(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    await agent.post(`${base()}/${created.body.id}/reveal`).expect(403);
  });

  it('без выдачи секция отвечает 404', async () => {
    const agent = await signIn('user@cairn.local');

    await agent.get(base()).expect(404);
  });

  it('правка значения растит версию, история и откат работают', async () => {
    const agent = await signIn('admin@cairn.local');
    const created = await agent.post(base()).send({ key: 'KEY', value: 'первое' });
    const id = created.body.id;

    await agent.patch(`${base()}/${id}`).send({ value: 'второе' }).expect(200);

    const history = await agent.get(`${base()}/${id}/versions`).expect(200);
    expect(history.body.map((version: { versionNo: number }) => version.versionNo)).toEqual([2, 1]);
    expect(JSON.stringify(history.body)).not.toContain('первое');

    const oldValue = await agent.post(`${base()}/${id}/versions/1/reveal`).expect(201);
    expect(oldValue.body.value).toBe('первое');

    await agent.post(`${base()}/${id}/rollback`).send({ toVersion: 1 }).expect(201);

    const revealed = await agent.post(`${base()}/${id}/reveal`).expect(201);
    expect(revealed.body).toEqual({ value: 'первое', versionNo: 3 });
  });

  it('импортирует env и различает создание, обновление, совпадение', async () => {
    const agent = await signIn('admin@cairn.local');
    await agent.post(base()).send({ key: 'KEEP', value: 'то же' });

    const result = await agent
      .post(`${base()}/import`)
      .send({ content: 'KEEP=то же\nFRESH=новая' })
      .expect(201);

    expect(result.body).toEqual({ created: ['FRESH'], updated: [], unchanged: ['KEEP'] });

    const again = await agent
      .post(`${base()}/import`)
      .send({ content: 'FRESH=новая' })
      .expect(201);
    expect(again.body.unchanged).toEqual(['FRESH']);
  });

  it('отвергает нечитаемый env с кодом 400', async () => {
    const agent = await signIn('admin@cairn.local');

    await agent.post(`${base()}/import`).send({ content: 'мусор без равно' }).expect(400);
  });

  it('выгружает env текстом', async () => {
    const agent = await signIn('admin@cairn.local');
    await agent.post(base()).send({ key: 'PORT', value: '3000' });

    const response = await agent.get(`${base()}/export`).expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toBe('PORT=3000\n');
  });

  it('удаляет переменную и освобождает ключ', async () => {
    const agent = await signIn('admin@cairn.local');
    const created = await agent.post(base()).send({ key: 'KEY', value: 'x' });

    await agent.delete(`${base()}/${created.body.id}`).expect(204);
    await agent.post(base()).send({ key: 'KEY', value: 'снова' }).expect(201);
  });

  it('отдаёт окружения для переключателя по уровню переменных', async () => {
    await grantLevel(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    const response = await agent.get(`/projects/${projectId}/variables/environments`).expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ id: environmentId, name: 'Прод' }),
    ]);
  });

  it('требует входа', async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
  });
});
