import { AccessLevel, Section, SubjectKind, TASK_PLACED, TaskOrigin } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { bodyParsers } from '../src/common/body-parsers';
import { DATABASE } from '../src/db/db.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('HTTP: задачи проекта', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let otherProjectId: string;
  let memberSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    bodyParsers().forEach((parser) => app.use(parser));
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
    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'chuzhoj', name: 'Чужой' })
      .returning();
    otherProjectId = other!.id;
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

  const base = () => `/projects/${projectId}/tasks`;
  const roadmap = () => `/projects/${projectId}/roadmap`;

  it('заводит задачу вне версии и отдаёт её в списке', async () => {
    const agent = await signIn('admin@cairn.local');

    const created = await agent
      .post(base())
      .send({ title: 'Поднять предел текста' })
      .expect(201);

    expect(created.body).toMatchObject({
      title: 'Поднять предел текста',
      origin: TaskOrigin.Manual,
      placement: null,
      platformIds: [],
    });

    const list = await agent.get(base()).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('правка возвращает задачу целиком, включая размещение', async () => {
    const agent = await signIn('admin@cairn.local');
    const created = await agent.post(base()).send({ title: 'Было' }).expect(201);

    const updated = await agent
      .put(`${base()}/${created.body.id}`)
      .send({ title: 'Стало', url: 'https://tracker.example/7' })
      .expect(200);

    expect(updated.body).toMatchObject({ title: 'Стало', url: 'https://tracker.example/7' });
  });

  it('задача, заведённая в версии, появляется в реестре с размещением', async () => {
    // Путь «из роадмапа»: чекпоинт заводит задачу вместе с размещением, и
    // реестр обязан её показать — иначе экран задач врал бы о проекте.
    const agent = await signIn('admin@cairn.local');
    const version = await agent.post(`${roadmap()}/versions`).send({ label: 'v1.0' }).expect(201);
    await agent
      .post(`${roadmap()}/versions/${version.body.id}/checkpoints`)
      .send({ title: 'Оплата' })
      .expect(201);

    const list = await agent.get(base()).expect(200);

    expect(list.body[0]).toMatchObject({
      title: 'Оплата',
      origin: TaskOrigin.Roadmap,
      placement: { versionLabel: 'v1.0', isDone: false, position: 1 },
    });
  });

  it('существующая задача кладётся в версию ссылкой, а не второй формулировкой', async () => {
    const agent = await signIn('admin@cairn.local');
    const task = await agent.post(base()).send({ title: 'Ждёт в реестре' }).expect(201);
    const version = await agent.post(`${roadmap()}/versions`).send({ label: 'v1.0' }).expect(201);

    const checkpoint = await agent
      .post(`${roadmap()}/versions/${version.body.id}/checkpoints`)
      .send({ taskId: task.body.id })
      .expect(201);

    expect(checkpoint.body).toMatchObject({ taskId: task.body.id, title: 'Ждёт в реестре' });
  });

  it('второе размещение той же задачи — 409', async () => {
    const agent = await signIn('admin@cairn.local');
    const task = await agent.post(base()).send({ title: 'Одна задача' }).expect(201);
    const first = await agent.post(`${roadmap()}/versions`).send({ label: 'v1.0' }).expect(201);
    const second = await agent.post(`${roadmap()}/versions`).send({ label: 'v2.0' }).expect(201);

    await agent
      .post(`${roadmap()}/versions/${first.body.id}/checkpoints`)
      .send({ taskId: task.body.id })
      .expect(201);

    await agent
      .post(`${roadmap()}/versions/${second.body.id}/checkpoints`)
      .send({ taskId: task.body.id })
      .expect(409);
  });

  it('тело с задачей и формулировкой сразу — 400', async () => {
    const agent = await signIn('admin@cairn.local');
    const task = await agent.post(base()).send({ title: 'Задача' }).expect(201);
    const version = await agent.post(`${roadmap()}/versions`).send({ label: 'v1.0' }).expect(201);

    await agent
      .post(`${roadmap()}/versions/${version.body.id}/checkpoints`)
      .send({ taskId: task.body.id, title: 'И формулировка' })
      .expect(400);
  });

  it('размещённую задачу удалить нельзя: 409 с кодом', async () => {
    const agent = await signIn('admin@cairn.local');
    const version = await agent.post(`${roadmap()}/versions`).send({ label: 'v1.0' }).expect(201);
    const checkpoint = await agent
      .post(`${roadmap()}/versions/${version.body.id}/checkpoints`)
      .send({ title: 'Оплата' })
      .expect(201);

    const refused = await agent.delete(`${base()}/${checkpoint.body.taskId}`).expect(409);

    expect(refused.body.code).toBe(TASK_PLACED);
  });

  it('вынутая из версии задача остаётся в реестре без размещения', async () => {
    const agent = await signIn('admin@cairn.local');
    const version = await agent.post(`${roadmap()}/versions`).send({ label: 'v1.0' }).expect(201);
    const checkpoint = await agent
      .post(`${roadmap()}/versions/${version.body.id}/checkpoints`)
      .send({ title: 'Оплата' })
      .expect(201);

    const detached = await agent.post(`${base()}/${checkpoint.body.taskId}/detach`).expect(201);

    expect(detached.body).toMatchObject({ title: 'Оплата', placement: null });
    await agent.delete(`${base()}/${checkpoint.body.taskId}`).expect(204);
  });

  it('без сессии — 401, без выдачи — 404, на чтении — 403', async () => {
    const anonymous = request.agent(app.getHttpServer());
    await anonymous.get(base()).expect(401);

    const member = await signIn('user@cairn.local');
    await member.get(base()).expect(404);

    await grantLevel(AccessLevel.Read);
    await member.get(base()).expect(200);
    await member.post(base()).send({ title: 'Нельзя' }).expect(403);
  });

  it('чужой проект не раскрывается: 404', async () => {
    const member = await signIn('user@cairn.local');
    await grantLevel(AccessLevel.Write);

    await member.get(`/projects/${otherProjectId}/tasks`).expect(404);
  });

  it('строгое тело: лишнее поле — 400, негодный адрес — 400', async () => {
    const agent = await signIn('admin@cairn.local');

    await agent.post(base()).send({ title: 'Задача', assignee: 'кто-то' }).expect(400);
    await agent.post(base()).send({ title: 'Задача', url: 'TASK-17' }).expect(400);
    await agent.post(base()).send({ title: '   ' }).expect(400);
  });
});
