import { EnvironmentKind, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { auditLog, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('HTTP: токены агентов и MCP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;

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
    await testDb.db.insert(users).values({
      subjectId: adminSubject!.id,
      email: 'admin@cairn.local',
      passwordHash,
      isSuperadmin: true,
    });

    const [memberSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    await testDb.db
      .insert(users)
      .values({ subjectId: memberSubject!.id, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект', purpose: 'Назначение для агента' })
      .returning();
    projectId = project!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  async function createToken(canRevealVariables = false): Promise<string> {
    const admin = await signIn('admin@cairn.local');
    const response = await admin
      .post(`/projects/${projectId}/agent-tokens`)
      .send({ label: 'Cursor', canRevealVariables })
      .expect(201);

    return response.body.token;
  }

  /** Вызов JSON-RPC на MCP-обработчик. */
  function rpc(token: string | null, body: object) {
    const call = request(app.getHttpServer())
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send(body);

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  const INITIALIZE = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    },
  };

  function toolsCall(name: string, args: object = {}) {
    return {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    };
  }

  /** Достаёт JSON-RPC result из ответа (SDK может отвечать SSE-потоком). */
  function resultOf(response: { text: string; body: unknown }): unknown {
    const text = response.text;

    if (text.startsWith('event:') || text.includes('\ndata:') || text.startsWith('data:')) {
      const dataLine = text.split('\n').find((line) => line.startsWith('data:'));

      return JSON.parse(dataLine!.slice('data:'.length).trim());
    }

    return response.body;
  }

  describe('управление токенами', () => {
    it('создание отдаёт токен один раз, список — без токенов', async () => {
      const admin = await signIn('admin@cairn.local');
      const created = await admin
        .post(`/projects/${projectId}/agent-tokens`)
        .send({ label: 'Cursor' })
        .expect(201);

      expect(created.body.token.length).toBeGreaterThanOrEqual(32);
      expect(created.body.mcpUrl).toContain('/api/mcp');

      const list = await admin.get(`/projects/${projectId}/agent-tokens`).expect(200);
      expect(list.body[0]).toMatchObject({ label: 'Cursor', canRevealVariables: false });
      expect(JSON.stringify(list.body)).not.toContain(created.body.token);
    });

    it('не-суперадмин не управляет токенами', async () => {
      const agent = await signIn('user@cairn.local');

      await agent.post(`/projects/${projectId}/agent-tokens`).send({ label: 'X' }).expect(403);
      await agent.get(`/projects/${projectId}/agent-tokens`).expect(403);
    });
  });

  describe('MCP', () => {
    it('без токена и с мусорным токеном — 401', async () => {
      await rpc(null, INITIALIZE).expect(401);
      await rpc('garbage-token', INITIALIZE).expect(401);
    });

    it('initialize согласует протокол', async () => {
      const token = await createToken();

      const response = await rpc(token, INITIALIZE).expect(200);
      const result = resultOf(response) as { result?: { serverInfo?: { name?: string } } };

      expect(result.result?.serverInfo?.name).toBe('cairn');
    });

    it('tools/list не содержит reveal_variable без флага и содержит с ним', async () => {
      const plain = await createToken(false);
      const trusted = await createToken(true);

      const listPlain = resultOf(
        await rpc(plain, { jsonrpc: '2.0', id: 3, method: 'tools/list' }).expect(200),
      ) as { result: { tools: { name: string }[] } };
      const listTrusted = resultOf(
        await rpc(trusted, { jsonrpc: '2.0', id: 3, method: 'tools/list' }).expect(200),
      ) as { result: { tools: { name: string }[] } };

      const plainNames = listPlain.result.tools.map((tool) => tool.name);
      const trustedNames = listTrusted.result.tools.map((tool) => tool.name);

      expect(plainNames).toContain('get_project_info');
      expect(plainNames).toContain('search_docs');
      expect(plainNames).not.toContain('reveal_variable');
      expect(trustedNames).toContain('reveal_variable');
    });

    it('get_project_info читает паспорт и пишет вызов в журнал', async () => {
      const token = await createToken();

      const response = resultOf(
        await rpc(token, toolsCall('get_project_info')).expect(200),
      ) as { result: { content: { text: string }[] } };

      expect(response.result.content[0]!.text).toContain('Назначение для агента');

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'agent.tool_called'));
      expect(entry?.subjectKind).toBe(SubjectKind.AgentToken);
      expect(entry?.metadata).toMatchObject({ tool: 'get_project_info' });
    });

    it('search_docs находит страницу, list_variable_keys не отдаёт значений', async () => {
      const admin = await signIn('admin@cairn.local');
      await admin
        .post(`/projects/${projectId}/docs`)
        .send({ title: 'Развёртывание', content: 'Запусти pnpm install и жди.' })
        .expect(201);
      const environment = await admin
        .post(`/projects/${projectId}/environments`)
        .send({ name: 'Прод', kind: EnvironmentKind.Production })
        .expect(201);
      await admin
        .post(`/projects/${projectId}/environments/${environment.body.id}/variables`)
        .send({ key: 'DATABASE_URL', value: 'postgres://very-secret' })
        .expect(201);

      const token = await createToken();

      const docs = resultOf(
        await rpc(token, toolsCall('search_docs', { query: 'pnpm' })).expect(200),
      ) as { result: { content: { text: string }[] } };
      expect(docs.result.content[0]!.text).toContain('Развёртывание');

      const keys = resultOf(
        await rpc(token, toolsCall('list_variable_keys')).expect(200),
      ) as { result: { content: { text: string }[] } };
      expect(keys.result.content[0]!.text).toContain('DATABASE_URL');
      expect(keys.result.content[0]!.text).not.toContain('very-secret');
    });

    it('reveal_variable работает только с флагом и пишет оба действия', async () => {
      const admin = await signIn('admin@cairn.local');
      const environment = await admin
        .post(`/projects/${projectId}/environments`)
        .send({ name: 'Прод', kind: EnvironmentKind.Production })
        .expect(201);
      await admin
        .post(`/projects/${projectId}/environments/${environment.body.id}/variables`)
        .send({ key: 'DATABASE_URL', value: 'postgres://very-secret' })
        .expect(201);

      const trusted = await createToken(true);

      const revealed = resultOf(
        await rpc(
          trusted,
          toolsCall('reveal_variable', { environment: 'Прод', key: 'DATABASE_URL' }),
        ).expect(200),
      ) as { result: { content: { text: string }[] } };
      expect(revealed.result.content[0]!.text).toContain('postgres://very-secret');

      const actions = (await testDb.db.select().from(auditLog)).map((entry) => entry.action);
      expect(actions).toContain('agent.tool_called');
      expect(actions).toContain('variable.revealed');

      // Запись о вызове не содержит значения.
      const calls = (await testDb.db.select().from(auditLog)).filter(
        (entry) => entry.action === 'agent.tool_called',
      );
      expect(JSON.stringify(calls)).not.toContain('very-secret');
    });

    it('остальные инструменты чтения возвращают данные секций', async () => {
      const admin = await signIn('admin@cairn.local');
      await admin
        .post(`/projects/${projectId}/docs`)
        .send({ title: 'Развёртывание', content: 'Полное содержимое страницы.' })
        .expect(201);
      const version = await admin
        .post(`/projects/${projectId}/roadmap/versions`)
        .send({ label: 'v1.0', state: 'in_progress' })
        .expect(201);
      await admin
        .post(`/projects/${projectId}/roadmap/versions/${version.body.id}/checkpoints`)
        .send({ title: 'Первый чекпоинт' })
        .expect(201);
      await admin
        .post(`/projects/${projectId}/chronicle`)
        .send({ occurredOn: '2026-08-28', title: 'Решение', content: 'Выпускаем в пятницу.' })
        .expect(201);
      await admin
        .post(`/projects/${projectId}/environments`)
        .send({ name: 'Прод', kind: EnvironmentKind.Production })
        .expect(201);

      const token = await createToken();

      const doc = resultOf(
        await rpc(token, toolsCall('read_doc_page', { title: 'Развёртывание' })).expect(200),
      ) as { result: { content: { text: string }[] } };
      expect(doc.result.content[0]!.text).toContain('Полное содержимое страницы');

      const roadmap = resultOf(await rpc(token, toolsCall('get_roadmap')).expect(200)) as {
        result: { content: { text: string }[] };
      };
      expect(roadmap.result.content[0]!.text).toContain('Первый чекпоинт');

      const chronicle = resultOf(await rpc(token, toolsCall('read_chronicle')).expect(200)) as {
        result: { content: { text: string }[] };
      };
      expect(chronicle.result.content[0]!.text).toContain('Решение');

      const status = resultOf(await rpc(token, toolsCall('get_status')).expect(200)) as {
        result: { content: { text: string }[] };
      };
      expect(status.result.content[0]!.text).toContain('Прод');
    });

    it('инструменты не достают чужой проект', async () => {
      const admin = await signIn('admin@cairn.local');
      const [other] = await testDb.db
        .insert(projects)
        .values({ slug: 'chuzhoj', name: 'Чужой', purpose: 'Чужое назначение' })
        .returning();
      await admin
        .post(`/projects/${other!.id}/docs`)
        .send({ title: 'Чужая страница', content: 'Чужое содержимое.' })
        .expect(201);

      const token = await createToken();

      const info = resultOf(
        await rpc(token, toolsCall('get_project_info')).expect(200),
      ) as { result: { content: { text: string }[] } };
      expect(info.result.content[0]!.text).not.toContain('Чужое назначение');

      const docs = resultOf(
        await rpc(token, toolsCall('search_docs', { query: 'Чужое' })).expect(200),
      ) as { result: { content: { text: string }[] } };
      expect(docs.result.content[0]!.text).not.toContain('Чужая страница');

      const page = resultOf(
        await rpc(token, toolsCall('read_doc_page', { title: 'Чужая страница' })).expect(200),
      ) as { result: { content: { text: string }[] } };
      expect(page.result.content[0]!.text).not.toContain('Чужое содержимое');
      expect(page.result.content[0]!.text).toContain('не найдена');
    });

    it('прямой вызов reveal_variable без флага отвечает ошибкой', async () => {
      const token = await createToken(false);

      const response = resultOf(
        await rpc(
          token,
          toolsCall('reveal_variable', { environment: 'Прод', key: 'DATABASE_URL' }),
        ).expect(200),
      ) as { result: { isError?: boolean; content: { text: string }[] } };

      // Инструмент не зарегистрирован — SDK отвечает ошибкой вызова
      // («Tool not found»), а не данными.
      expect(response.result.isError).toBe(true);
      expect(response.result.content[0]!.text).toContain('not found');
      expect(JSON.stringify(response)).not.toContain('very-secret');
    });

    it('после отзыва токен получает 401', async () => {
      const token = await createToken();
      const admin = await signIn('admin@cairn.local');
      const list = await admin.get(`/projects/${projectId}/agent-tokens`).expect(200);

      await admin
        .delete(`/projects/${projectId}/agent-tokens/${list.body[0].id}`)
        .expect(204);

      await rpc(token, INITIALIZE).expect(401);
    });
  });
});
