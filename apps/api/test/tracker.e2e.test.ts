import {
  AccessLevel,
  ModelProbeOutcome,
  Section,
  SubjectKind,
  TRACKER_NOT_CONFIGURED,
  TRACKER_SECRET_MISSING,
  TrackerKind,
} from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { bodyParsers } from '../src/common/body-parsers';
import { DATABASE } from '../src/db/db.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

/** Токен, которого не должно быть ни в одном ответе. */
const TOKEN = 'weeek-token-ОЧЕНЬ-СЕКРЕТНЫЙ';

/** Полная настройка подключения: точечные проверки меняют одно поле. */
const CONNECTION = {
  baseUrl: 'https://api.weeek.net/public/v1',
  workspaceId: '4242',
  isEnabled: true,
};

describe('HTTP: трекер задач', () => {
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

  const connections = () => `/tracker-connections/${TrackerKind.Weeek}`;
  const projectTracker = () => `/projects/${projectId}/tracker`;

  describe('настройка подключения', () => {
    it('ненастроенное подключение отдаётся списком из одного вида', async () => {
      const agent = await signIn('admin@cairn.local');

      const list = await agent.get('/tracker-connections').expect(200);

      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({
        kind: TrackerKind.Weeek,
        baseUrl: '',
        hasSecret: false,
        isOperational: false,
      });
    });

    it('сохранённое подключение отдаётся без токена ни под каким именем', async () => {
      const agent = await signIn('admin@cairn.local');

      const saved = await agent
        .put(connections())
        .send({ ...CONNECTION, secret: TOKEN })
        .expect(200);

      expect(JSON.stringify(saved.body)).not.toContain(TOKEN);
      expect(saved.body).toMatchObject({ hasSecret: true, isOperational: true });

      const found = await agent.get(connections()).expect(200);
      expect(JSON.stringify(found.body)).not.toContain(TOKEN);
    });

    it('без токена подключение сохраняется и не работает', async () => {
      const agent = await signIn('admin@cairn.local');

      const saved = await agent.put(connections()).send(CONNECTION).expect(200);

      expect(saved.body).toMatchObject({
        isOperational: false,
        blockedBy: TRACKER_SECRET_MISSING,
      });
    });

    it('строгое тело: лишнее поле, http, пустой токен — 400', async () => {
      const agent = await signIn('admin@cairn.local');

      await agent.put(connections()).send({ ...CONNECTION, tracker: 'weeek' }).expect(400);
      await agent
        .put(connections())
        .send({ ...CONNECTION, baseUrl: 'http://api.weeek.net/public/v1' })
        .expect(400);
      await agent
        .put(connections())
        .send({ ...CONNECTION, baseUrl: 'https://api.weeek.net/public/v1?token=sk' })
        .expect(400);
      await agent.put(connections()).send({ ...CONNECTION, secret: '' }).expect(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('неизвестный вид трекера — 404, а не 400', async () => {
      // Адрес указывает на трекер, которого нет, и это ровно то, о чём
      // говорит `404`; `400` сообщал бы, что негоден запрос.
      const agent = await signIn('admin@cairn.local');

      await agent.get('/tracker-connections/jira').expect(404);
    });

    it('снятие подключения — 204 и дважды подряд тоже', async () => {
      const agent = await signIn('admin@cairn.local');
      await agent.put(connections()).send({ ...CONNECTION, secret: TOKEN }).expect(200);

      await agent.delete(connections()).expect(204);
      await agent.delete(connections()).expect(204);

      expect((await agent.get(connections()).expect(200)).body.baseUrl).toBe('');
    });

    it('настройка закрыта правом суперадмина: 401 без сессии, 403 подрядчику', async () => {
      const anonymous = request.agent(app.getHttpServer());
      await anonymous.get('/tracker-connections').expect(401);

      const member = await signIn('user@cairn.local');
      await member.get('/tracker-connections').expect(403);
      await member.put(connections()).send(CONNECTION).expect(403);
      await member.delete(connections()).expect(403);
      await member.post(`${connections()}/probe`).expect(403);
    });
  });

  describe('проверка связи', () => {
    it('ненастроенное подключение — 409 с кодом, и в сеть не идёт', async () => {
      const agent = await signIn('admin@cairn.local');

      const refused = await agent.post(`${connections()}/probe`).expect(409);

      expect(refused.body.code).toBe(TRACKER_NOT_CONFIGURED);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('читает пространство и отдаёт исход, не тело чужого ответа', async () => {
      await configure();
      const agent = await signIn('admin@cairn.local');
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ success: true, workspace: { id: 4242 } }), { status: 200 }),
      );

      const result = await agent.post(`${connections()}/probe`).expect(200);

      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.weeek.net/public/v1/ws');
      expect(result.body).toEqual({
        outcome: ModelProbeOutcome.Ok,
        status: 200,
        host: 'api.weeek.net',
        durationMs: expect.any(Number),
      });
    });

    it('отказ трекера — 200 с исходом: наша ручка справилась', async () => {
      await configure();
      const agent = await signIn('admin@cairn.local');
      fetchMock.mockResolvedValue(
        new Response(`{"error":"Bearer ${TOKEN} is invalid"}`, { status: 401 }),
      );

      const result = await agent.post(`${connections()}/probe`).expect(200);

      expect(result.body.outcome).toBe(ModelProbeOutcome.Unauthorized);
      expect(JSON.stringify(result.body)).not.toContain(TOKEN);
    });

    it('тела в запросе проверки не принимает вовсе', async () => {
      // Приняв токен в теле, ручка завела бы второй путь, по которому
      // секрет ходит, — и он проходит через тело `POST`, которое попадает
      // в логи обратного прокси у любого, кто их включил.
      await configure();
      const agent = await signIn('admin@cairn.local');

      await agent.post(`${connections()}/probe`).send({ secret: TOKEN }).expect(400);
    });
  });

  describe('трекер со стороны проекта', () => {
    it('без выдачи — 404, с чтением — готовность и пустая привязка', async () => {
      const member = await signIn('user@cairn.local');
      await member.get(projectTracker()).expect(404);

      await grantLevel(AccessLevel.Read);
      const found = await member.get(projectTracker()).expect(200);

      expect(found.body).toEqual({
        isOperational: false,
        blockedBy: expect.any(String),
        binding: null,
      });
    });

    it('адреса и состояния токена проектная ручка не раскрывает', async () => {
      await configure();
      await grantLevel(AccessLevel.Read);
      const member = await signIn('user@cairn.local');

      const found = await member.get(projectTracker()).expect(200);

      expect(Object.keys(found.body)).toEqual(['isOperational', 'blockedBy', 'binding']);
      expect(JSON.stringify(found.body)).not.toContain('api.weeek.net');
      expect(JSON.stringify(found.body)).not.toContain(TOKEN);
    });

    it('привязка требует записи: 403 на чтении, 200 на записи', async () => {
      const binding = { externalProjectId: '7', boardId: '11', boardColumnId: '31' };
      const member = await signIn('user@cairn.local');

      await member.put(`${projectTracker()}/binding`).send(binding).expect(404);

      await grantLevel(AccessLevel.Read);
      await member.put(`${projectTracker()}/binding`).send(binding).expect(403);
    });

    it('запись ставит привязку, и она видна в проектной ручке', async () => {
      await grantLevel(AccessLevel.Write);
      const member = await signIn('user@cairn.local');
      const binding = { externalProjectId: '7', boardId: '11', boardColumnId: '31' };

      const saved = await member.put(`${projectTracker()}/binding`).send(binding).expect(200);

      expect(saved.body).toMatchObject({
        tracker: TrackerKind.Weeek,
        externalProjectId: '7',
        updatedByLabel: 'user@cairn.local',
      });

      const found = await member.get(projectTracker()).expect(200);
      expect(found.body.binding).toMatchObject({ boardColumnId: '31' });
    });

    it('половина привязки — 400: класть «куда-нибудь» нельзя', async () => {
      await grantLevel(AccessLevel.Write);
      const member = await signIn('user@cairn.local');

      await member
        .put(`${projectTracker()}/binding`)
        .send({ externalProjectId: '7', boardId: '11' })
        .expect(400);
      await member
        .put(`${projectTracker()}/binding`)
        .send({ externalProjectId: '7', boardId: '11', boardColumnId: '31', tracker: 'weeek' })
        .expect(400);
    });
  });

  describe('списки для привязки', () => {
    it('без подключения — 409 с кодом, и в сеть не идёт', async () => {
      await grantLevel(AccessLevel.Write);
      const member = await signIn('user@cairn.local');

      const refused = await member.get(`${projectTracker()}/targets`).expect(409);

      expect(refused.body.code).toBe(TRACKER_NOT_CONFIGURED);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('без права записи — 404 без выдачи и 403 на чтении, сеть не трогается', async () => {
      await configure();
      const member = await signIn('user@cairn.local');

      await member.get(`${projectTracker()}/targets`).expect(404);

      await grantLevel(AccessLevel.Read);
      await member.get(`${projectTracker()}/targets`).expect(403);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('отдаёт имена проектов, досок и колонок, но не токен', async () => {
      await configure();
      await grantLevel(AccessLevel.Write);
      const member = await signIn('user@cairn.local');
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              // По подстроке, а не по концу адреса: списки листаются, и в
              // строке запроса едут `perPage` с `offset`.
              url.includes('/tm/projects')
                ? { projects: [{ id: 7, name: 'CAIRN' }] }
                : url.includes('/tm/boards')
                  ? { boards: [{ id: 11, name: 'Разработка', projectId: 7 }] }
                  : { boardColumns: [{ id: 31, name: 'Бэклог', boardId: 11 }] },
            ),
            { status: 200 },
          ),
        ),
      );

      const targets = await member.get(`${projectTracker()}/targets`).expect(200);

      expect(targets.body).toEqual({
        projects: [{ id: '7', name: 'CAIRN' }],
        boards: [{ id: '11', name: 'Разработка', projectId: '7' }],
        columns: [{ id: '31', name: 'Бэклог', boardId: '11' }],
      });
      // Токен уходит заголовком и остаётся на сервере (дизайн, 9.3).
      expect(JSON.stringify(targets.body)).not.toContain(TOKEN);
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('отказ трекера доезжает названным кодом, а не 500', async () => {
      await configure();
      await grantLevel(AccessLevel.Write);
      const member = await signIn('user@cairn.local');
      fetchMock.mockResolvedValue(new Response('', { status: 401 }));

      const refused = await member.get(`${projectTracker()}/targets`).expect(502);

      expect(refused.body.code).toBe('tracker_rejected');
      expect(JSON.stringify(refused.body)).not.toContain(TOKEN);
    });
  });
});
