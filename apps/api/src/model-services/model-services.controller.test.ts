import {
  MODEL_SERVICE_BAD_URL,
  MODEL_SERVICE_NOT_CONFIGURED,
  ModelAuthScheme,
  ModelProbeOutcome,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  SubjectKind,
  modelServiceSettingsSchema,
  type ModelProbeResult,
} from '@cairn/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { AuthModule } from '../auth/auth.module';
import { PasswordService } from '../auth/password.service';
import { DATABASE } from '../db/db.module';
import { subjects, users } from '../db/schema';
import { SUGGESTER_NODE_ENV_NAMES } from '../summaries/suggester/settings';
import {
  TASK_SUGGESTER_SOURCE,
  type TaskSuggester,
  type TaskSuggesterSource,
} from '../summaries/suggester/task-suggester';
import { ModelServicesModule } from './model-services.module';

describe('настройка служб модели по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let saved: Record<string, string | undefined>;

  /** Годная настройка узла: тесты меняют в ней одно поле. */
  const input = {
    baseUrl: 'https://api.proxyapi.ru/v1',
    authScheme: ModelAuthScheme.Bearer,
    model: 'qwen/qwen3-max',
    folder: null,
    placement: ModelServicePlacement.External,
    timeoutSeconds: 60,
    isEnabled: true,
  };

  const probe = vi.fn<TaskSuggester['probe']>();
  /** Заглушка порта: ни один тест не ходит в сеть. */
  const source: TaskSuggesterSource = {
    current: async () =>
      ({
        placement: ModelServicePlacement.External,
        model: 'qwen/qwen3-max',
        host: 'api.proxyapi.ru',
        maxChars: 40_000,
        isEnabled: true,
        suggest: vi.fn(),
        probe,
      }) as TaskSuggester,
  };

  const unavailable: ModelProbeResult = {
    outcome: ModelProbeOutcome.Unavailable,
    status: null,
    host: 'api.proxyapi.ru',
    model: 'qwen/qwen3-max',
    durationMs: 7,
  };

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, ModelServicesModule],
    })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .overrideProvider(TASK_SUGGESTER_SOURCE)
      .useValue(source)
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
    probe.mockReset();
    probe.mockResolvedValue(unavailable);

    const passwordHash = await new PasswordService().hash('очень длинный пароль');

    for (const [email, isSuperadmin] of [
      ['admin@cairn.local', true],
      ['user@cairn.local', false],
    ] as const) {
      const [subject] = await testDb.db
        .insert(subjects)
        .values({ kind: SubjectKind.User, label: email })
        .returning();
      await testDb.db
        .insert(users)
        .values({ subjectId: subject!.id, email, passwordHash, isSuperadmin });
    }

    saved = Object.fromEntries(SUGGESTER_NODE_ENV_NAMES.map((name) => [name, process.env[name]]));
    for (const name of SUGGESTER_NODE_ENV_NAMES) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of SUGGESTER_NODE_ENV_NAMES) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
  });

  async function signIn(email = 'admin@cairn.local') {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  it('не-суперадмину отвечает 403, а не 404', async () => {
    // Правило нераскрытия защищает сведения о том, какие проекты
    // существуют; существование раздела администрирования секретом не
    // является (TSDoc SuperadminGuard).
    const member = await signIn('user@cairn.local');

    await member.get('/model-services').expect(403);
    await member.get('/model-services/task_suggester').expect(403);
    await member.put('/model-services/task_suggester').send(input).expect(403);
    await member.delete('/model-services/task_suggester').expect(403);
    await member.post('/model-services/task_suggester/probe').expect(403);
  });

  it('без сессии не отвечает ничем, кроме 401', async () => {
    await request(app.getHttpServer()).get('/model-services').expect(401);
  });

  it('список отдаёт и ненастроенные узлы', async () => {
    // Пустой список выглядел бы как «настраивать нечего» (дизайн, 5.1).
    const admin = await signIn();

    const { body } = await admin.get('/model-services').expect(200);

    expect(body).toHaveLength(Object.values(ModelServiceKind).length);
    expect(body[0]).toMatchObject({ source: ModelServiceSource.None });
  });

  it('ключ не выходит наружу: состав полей ответа сравнивается целиком', async () => {
    const admin = await signIn();

    await admin.put('/model-services/task_suggester').send({ ...input, secret: 'sk-утечка' }).expect(200);

    const { body } = await admin.get('/model-services/task_suggester').expect(200);

    // Состав полей целиком, а не поиск отсутствия подстроки: новая ручка
    // не должна получать ключ в ответе бесплатно (дизайн, 5.2).
    expect(Object.keys(body).sort()).toEqual(Object.keys(modelServiceSettingsSchema.shape).sort());
    expect(JSON.stringify(body)).not.toContain('sk-утечка');
    expect(body.hasSecret).toBe(true);
  });

  it('запись отдаёт действующую настройку и источник «база»', async () => {
    const admin = await signIn();

    const { body } = await admin
      .put('/model-services/task_suggester')
      .send({ ...input, secret: 'ключ' })
      .expect(200);

    expect(body).toMatchObject({
      source: ModelServiceSource.Database,
      host: 'api.proxyapi.ru',
      isOperational: true,
      updatedByLabel: 'admin@cairn.local',
    });
  });

  it('негодный адрес — 400 с кодом в теле', async () => {
    const admin = await signIn();

    const { body } = await admin
      .put('/model-services/task_suggester')
      .send({ ...input, baseUrl: 'https://api.example/v1?key=sk-secret' })
      .expect(400);

    expect(body.code).toBe(MODEL_SERVICE_BAD_URL);
  });

  it('лишнее поле отвергается: пресеты не хранятся', async () => {
    const admin = await signIn();

    await admin
      .put('/model-services/task_suggester')
      .send({ ...input, preset: 'yandex' })
      .expect(400);
  });

  it('неизвестный узел — 404', async () => {
    const admin = await signIn();

    await admin.get('/model-services/pochta').expect(404);
    await admin.put('/model-services/pochta').send(input).expect(404);
    await admin.delete('/model-services/pochta').expect(404);
    await admin.post('/model-services/pochta/probe').expect(404);
  });

  it('сброс идемпотентен', async () => {
    // Иначе кнопка «Вернуть настройку окружения», нажатая дважды,
    // показала бы отказ там, где желаемое состояние уже достигнуто.
    const admin = await signIn();

    await admin.put('/model-services/task_suggester').send(input).expect(200);
    await admin.delete('/model-services/task_suggester').expect(204);
    await admin.delete('/model-services/task_suggester').expect(204);

    const { body } = await admin.get('/model-services/task_suggester').expect(200);

    expect(body.source).toBe(ModelServiceSource.None);
  });

  it('неудачная проверка связи — 200, а не 502', async () => {
    // Наша ручка справилась: она выяснила, что чужой узел не отвечает, и
    // это и есть её результат (дизайн, 5.1).
    const admin = await signIn();
    await admin.put('/model-services/task_suggester').send({ ...input, secret: 'ключ' }).expect(200);

    const { body } = await admin.post('/model-services/task_suggester/probe').expect(200);

    expect(body.outcome).toBe(ModelProbeOutcome.Unavailable);
  });

  it('проверка ненастроенного узла — 409 с кодом', async () => {
    const admin = await signIn();

    const { body } = await admin.post('/model-services/task_suggester/probe').expect(409);

    expect(body.code).toBe(MODEL_SERVICE_NOT_CONFIGURED);
    expect(probe).not.toHaveBeenCalled();
  });

  it('проверка связи тела не принимает', async () => {
    // Иначе ключ поехал бы в теле POST, которое попадает в логи
    // обратного прокси у любого, кто их включил (дизайн, 8.4).
    const admin = await signIn();
    await admin.put('/model-services/task_suggester').send({ ...input, secret: 'ключ' }).expect(200);

    await admin
      .post('/model-services/task_suggester/probe')
      .send({ secret: 'sk-мимо-базы' })
      .expect(400);
  });
});
