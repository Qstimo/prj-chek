import {
  AccessLevel,
  Section,
  SubjectKind,
  TRACKER_BINDING_MISSING,
  TRACKER_NOT_CONFIGURED,
  TRACKER_REJECTED,
  TaskExportOutcome,
  TaskOrigin,
  TrackerKind,
} from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { bodyParsers } from '../src/common/body-parsers';
import { DATABASE } from '../src/db/db.module';
import {
  grants,
  projectTasks,
  projects,
  subjects,
  trackerProjectBindings,
  users,
} from '../src/db/schema';
import { TASK_EXPORT_LOCK_DB } from '../src/tracker/task-exports.service';
import { startTestDatabase, type TestDatabase } from './db-fixture';

/** Токен, которого не должно быть ни в одном ответе. */
const TOKEN = 'weeek-token-ОЧЕНЬ-СЕКРЕТНЫЙ';

/** Полная настройка подключения: её ставит суперадмин на `/settings`. */
const CONNECTION = {
  baseUrl: 'https://api.weeek.net/public/v1',
  workspaceId: '4242',
  isEnabled: true,
};

describe('HTTP: выгрузка задач в трекер', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let memberSubjectId: string;
  let adminUserId: string;
  let fetchMock: Mock;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      // Замок задачи держится на своём соединении, пока записи обмена идут
      // своими транзакциями на рабочем. В развёртывании это один пул на
      // десяток соединений; здесь пул — одно соединение, и один на оба
      // означал бы, что выгрузка запирает сама себя.
      .overrideProvider(TASK_EXPORT_LOCK_DB)
      .useValue(testDb.pool())
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

    // Сеть подменяется **во всех** проверках, включая те, что до неё не
    // доходят: забытая подмена сделала бы падение теста зависящим от
    // доступности чужого API, то есть превратила бы отказ в «иногда».
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  /** Настроенное и работающее подключение: ставится от лица суперадмина. */
  async function configure(): Promise<void> {
    const agent = await signIn('admin@cairn.local');

    await agent
      .put(`/tracker-connections/${TrackerKind.Weeek}`)
      .send({ ...CONNECTION, secret: TOKEN })
      .expect(200);
  }

  async function bind(): Promise<void> {
    await testDb.db.insert(trackerProjectBindings).values({
      projectId,
      tracker: TrackerKind.Weeek,
      externalProjectId: '7',
      boardId: '11',
      boardColumnId: '31',
      updatedBySubjectId: memberSubjectId,
    });
  }

  async function seedTask(title: string): Promise<string> {
    const [task] = await testDb.db
      .insert(projectTasks)
      .values({ projectId, title, origin: TaskOrigin.Manual })
      .returning();

    return task!.id;
  }

  /**
   * Ответ Weeek на создание или правку задачи.
   *
   * Функцией, а не готовым объектом: тело `Response` читается один раз, и
   * один объект на два вызова дал бы отказ разбора вместо отказа трекера —
   * то есть тест проверял бы не то, что написано в его названии.
   */
  function taskResponse(id: number, status = 200): Response {
    return new Response(
      JSON.stringify({ success: true, task: { id, boardId: 11, boardColumnId: 31 } }),
      { status },
    );
  }

  const exportUrl = () => `/projects/${projectId}/tasks/export`;

  it('без выдачи — 404, и в сеть не идёт ни один байт', async () => {
    await configure();
    await bind();
    const taskId = await seedTask('Оплата');
    const member = await signIn('user@cairn.local');

    await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(404);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('чтения мало — 403: наружу уходит содержимое проекта', async () => {
    await configure();
    await bind();
    await grantLevel(AccessLevel.Read);
    const taskId = await seedTask('Оплата');
    const member = await signIn('user@cairn.local');

    await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(403);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('без привязки — 409 с названным кодом, и в сеть не идёт', async () => {
    await configure();
    await grantLevel(AccessLevel.Write);
    const taskId = await seedTask('Оплата');
    const member = await signIn('user@cairn.local');

    const refused = await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(409);

    expect(refused.body.code).toBe(TRACKER_BINDING_MISSING);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('без подключения — 409 с кодом «трекер не настроен»', async () => {
    await bind();
    await grantLevel(AccessLevel.Write);
    const taskId = await seedTask('Оплата');
    const member = await signIn('user@cairn.local');

    const refused = await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(409);

    expect(refused.body.code).toBe(TRACKER_NOT_CONFIGURED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('строгое тело: пустой набор, лишнее поле, не-uuid — 400', async () => {
    await configure();
    await bind();
    await grantLevel(AccessLevel.Write);
    const member = await signIn('user@cairn.local');

    await member.post(exportUrl()).send({ taskIds: [] }).expect(400);
    // Доска приходит привязкой проекта, а не телом: иначе задачу положили
    // бы на чужую доску, минуя настройку.
    await member
      .post(exportUrl())
      .send({ taskIds: ['11111111-1111-1111-1111-111111111111'], boardId: '11' })
      .expect(400);
    // Формулировок в теле нет: наружу уходит содержимое реестра.
    await member.post(exportUrl()).send({ taskIds: ['Оплата картой'] }).expect(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('неизвестная задача — 404, и ни одна задача набора не уезжает', async () => {
    await configure();
    await bind();
    await grantLevel(AccessLevel.Write);
    const taskId = await seedTask('Оплата');
    const member = await signIn('user@cairn.local');

    await member
      .post(exportUrl())
      .send({ taskIds: [taskId, '11111111-1111-1111-1111-111111111111'] })
      .expect(404);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('выгружает набор: два вызова, два итога, токен в заголовке и только там', async () => {
    await configure();
    await bind();
    await grantLevel(AccessLevel.Write);
    const first = await seedTask('Первая');
    const second = await seedTask('Вторая');
    const member = await signIn('user@cairn.local');
    fetchMock.mockResolvedValueOnce(taskResponse(1));
    fetchMock.mockResolvedValueOnce(taskResponse(2));

    const done = await member.post(exportUrl()).send({ taskIds: [first, second] }).expect(201);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.weeek.net/public/v1/tm/tasks');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(done.body).toEqual([
      {
        taskId: first,
        outcome: TaskExportOutcome.Created,
        failureCode: null,
        export: expect.objectContaining({ externalId: '1', isCompleted: false }),
      },
      {
        taskId: second,
        outcome: TaskExportOutcome.Created,
        failureCode: null,
        export: expect.objectContaining({ externalId: '2' }),
      },
    ]);
    // Токен уходит заголовком и остаётся на сервере.
    expect(JSON.stringify(done.body)).not.toContain(TOKEN);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('наружу уходит формулировка и идентификаторы привязки — и ничего больше', async () => {
    await configure();
    await bind();
    await grantLevel(AccessLevel.Write);
    const taskId = await seedTask('Оплата картой');
    const member = await signIn('user@cairn.local');
    fetchMock.mockImplementation(async () => taskResponse(1));

    await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(201);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: 'Оплата картой',
      projectId: '7',
      boardId: '11',
      boardColumnId: '31',
    });
  });

  it('повторная выгрузка идёт PUT по тому же идентификатору, и ссылка не меняется', async () => {
    await configure();
    await bind();
    await grantLevel(AccessLevel.Write);
    const taskId = await seedTask('Оплата');
    const member = await signIn('user@cairn.local');
    fetchMock.mockImplementation(async () => taskResponse(4096));

    const first = await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(201);
    const again = await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(201);

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.weeek.net/public/v1/tm/tasks/4096');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PUT');
    expect(again.body[0].outcome).toBe(TaskExportOutcome.Updated);
    expect(again.body[0].export.externalUrl).toBe(first.body[0].export.externalUrl);
    expect(again.body[0].export.exportedAt).toBe(first.body[0].export.exportedAt);
  });

  it('отказ трекера — 201 с итогом «не удалось», а не 500', async () => {
    // Исход у набора не один, и кодом HTTP его не выразить: `502` на
    // наборе, где три задачи уехали, сказал бы «ничего не вышло».
    await configure();
    await bind();
    await grantLevel(AccessLevel.Write);
    const taskId = await seedTask('Оплата');
    const member = await signIn('user@cairn.local');
    fetchMock.mockResolvedValue(new Response(`{"error":"Bearer ${TOKEN} is invalid"}`, { status: 401 }));

    const done = await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(201);

    expect(done.body).toEqual([
      { taskId, outcome: TaskExportOutcome.Failed, failureCode: TRACKER_REJECTED, export: null },
    ]);
    // Ни токена, ни тела чужого ответа: в нём бывает и то и другое.
    expect(JSON.stringify(done.body)).not.toContain(TOKEN);
    expect(JSON.stringify(done.body)).not.toContain('invalid');
  });

  it('первый отказ останавливает набор, и уехавшее остаётся уехавшим', async () => {
    await configure();
    await bind();
    await grantLevel(AccessLevel.Write);
    const first = await seedTask('Первая');
    const second = await seedTask('Вторая');
    const third = await seedTask('Третья');
    const member = await signIn('user@cairn.local');
    fetchMock.mockResolvedValueOnce(taskResponse(1));
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));

    const done = await member
      .post(exportUrl())
      .send({ taskIds: [first, second, third] })
      .expect(201);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(done.body.map((row: { outcome: string }) => row.outcome)).toEqual([
      TaskExportOutcome.Created,
      TaskExportOutcome.Failed,
      TaskExportOutcome.Skipped,
    ]);
    expect(done.body[0].export.externalId).toBe('1');
  });

  it('зеркало доезжает до списка задач и ничего в нём не закрывает', async () => {
    await configure();
    await bind();
    await grantLevel(AccessLevel.Write);
    const taskId = await seedTask('Оплата');
    const member = await signIn('user@cairn.local');
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ task: { id: 4096, boardColumnId: 31, isCompleted: true } }),
        { status: 200 },
      ),
    );

    await member.post(exportUrl()).send({ taskIds: [taskId] }).expect(201);
    const tasks = await member.get(`/projects/${projectId}/tasks`).expect(200);

    expect(tasks.body[0].export).toMatchObject({
      externalId: '4096',
      // Закрыта **там**: расхождение законно и показывается биркой.
      isCompleted: true,
      // Опроса не было: подставить сюда время выгрузки значило бы сказать,
      // что статус спрашивали.
      checkedAt: null,
    });
    // Здесь задача по-прежнему не в версии и ничем не закрыта.
    expect(tasks.body[0].placement).toBeNull();
  });
});
