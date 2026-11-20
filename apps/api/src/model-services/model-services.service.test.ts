import { randomBytes } from 'node:crypto';

import {
  MODEL_SERVICE_BAD_URL,
  MODEL_SERVICE_INSECURE_URL,
  MODEL_SERVICE_NOT_CONFIGURED,
  ModelAuthScheme,
  ModelProbeOutcome,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  SubjectKind,
  type ModelProbeResult,
  type ModelServiceUpdate,
} from '@cairn/shared';
import { asc } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { CryptoService } from '../crypto/crypto.service';
import { auditLog, subjects } from '../db/schema';
import { SUGGESTER_NODE_ENV_NAMES } from '../summaries/suggester/settings';
import type { TaskSuggester, TaskSuggesterSource } from '../summaries/suggester/task-suggester';
import type { Transcriber, TranscriberSource } from '../summaries/transcription/transcriber';
import { ModelServiceSettingsService } from './model-service-settings.service';
import { ModelServicesRepository } from './model-services.repository';
import { ModelServicesService } from './model-services.service';

describe('ModelServicesService', () => {
  let testDb: TestDatabase;
  let repository: ModelServicesRepository;
  let settings: ModelServiceSettingsService;
  let service: ModelServicesService;
  let admin: RequestSubject;
  let saved: Record<string, string | undefined>;

  const kind = ModelServiceKind.TaskSuggester;

  /** Полная настройка узла: каждая проверка меняет в ней одно поле. */
  const input: ModelServiceUpdate = {
    baseUrl: 'https://api.proxyapi.ru/v1',
    authScheme: ModelAuthScheme.Bearer,
    model: 'qwen/qwen3-max',
    folder: null,
    placement: ModelServicePlacement.External,
    timeoutSeconds: 60,
    isEnabled: true,
  };

  /** Исход, который отдаёт заглушка порта: в сеть не ходит ни один тест. */
  const probeResult: ModelProbeResult = {
    outcome: ModelProbeOutcome.Unauthorized,
    status: 401,
    host: 'api.proxyapi.ru',
    model: 'qwen/qwen3-max',
    durationMs: 12,
  };

  const probe = vi.fn<TaskSuggester['probe']>();
  /** Источник заглушки: адаптер строится по настройке, а не по токену. */
  const source: TaskSuggesterSource = {
    current: async () => {
      const resolved = await settings.resolve(kind);

      return {
        placement: resolved.placement,
        model: resolved.model,
        host: resolved.host,
        maxChars: 40_000,
        isEnabled: resolved.isOperational,
        suggest: vi.fn(),
        probe,
      };
    },
  };

  const transcriberProbe = vi.fn<Transcriber['probe']>();
  /**
   * Источник расшифровки: ручке проверки от порта нужен один `probe`, и
   * заглушка объявляет ровно его — остальное этих проверок не касается.
   */
  const transcribers = {
    current: async () => ({ probe: transcriberProbe }) as unknown as Transcriber,
  } satisfies TranscriberSource;

  /**
   * Записи журнала, старые сверху.
   *
   * Порядок внутри одной транзакции ненаблюдаем: `created_at` у её
   * записей — одно и то же время транзакции, а колонки-последовательности
   * у журнала нет. Поэтому две записи одной транзакции проверяются
   * составом, а не порядком.
   */
  async function auditRows() {
    return testDb.db.select().from(auditLog).orderBy(asc(auditLog.createdAt));
  }

  /** Метаданные записи по действию: ищется по действию, а не по месту. */
  async function metadataOf(action: AuditAction): Promise<unknown> {
    const rows = await auditRows();

    return rows.find((row) => row.action === action)?.metadata;
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new ModelServicesRepository(
      testDb.db,
      new CryptoService(randomBytes(32).toString('base64')),
    );
    settings = new ModelServiceSettingsService(testDb.db, repository);
    service = new ModelServicesService(
      testDb.db,
      repository,
      settings,
      new AuditService(),
      source,
      transcribers,
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    probe.mockReset();
    probe.mockResolvedValue(probeResult);
    transcriberProbe.mockReset();
    transcriberProbe.mockResolvedValue({ ...probeResult, host: 'stt.api.cloud.yandex.net' });

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ@cairn.local' })
      .returning();
    admin = {
      id: subject!.id,
      kind: SubjectKind.User,
      label: 'админ@cairn.local',
      isSuperadmin: true,
      isRevoked: false,
    };

    // Чистое окружение: ключ, оставленный в оболочке разработчика, включал
    // бы узел там, где проверяется ненастроенный.
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

  it('правка полей пишет одну запись с именами полей, но не значениями', async () => {
    // Образец — ServersService: в журнал попадают имена изменённых полей.
    await service.save(admin, kind, { ...input, model: 'другая' });

    const rows = await auditRows();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: AuditAction.ModelServiceUpdated,
      entityType: 'model_service',
      // Идентификатор строки и есть значение перечня (дизайн, 11.1).
      entityId: 'task_suggester',
      // Настройка межпроектна и ни одному проекту не принадлежит.
      projectId: null,
    });
    expect(await metadataOf(AuditAction.ModelServiceUpdated)).toEqual({
      host: 'api.proxyapi.ru',
      model: 'другая',
      authScheme: ModelAuthScheme.Bearer,
      placement: ModelServicePlacement.External,
      timeoutSeconds: 60,
      isEnabled: true,
      fields: ['baseUrl', 'authScheme', 'model', 'folder', 'placement', 'timeoutSeconds', 'isEnabled'],
      source: ModelServiceSource.Database,
    });
  });

  it('правка полей и ключа одним запросом пишет две записи в одной транзакции', async () => {
    // Образец есть: создание саммари пишет chronicle_entry.created и
    // summary.created одной транзакцией (дизайн, 11.2).
    await service.save(admin, kind, { ...input, model: 'другая', secret: 'новый' });

    expect((await auditRows()).map((row) => row.action).sort()).toEqual([
      AuditAction.ModelServiceSecretSet,
      AuditAction.ModelServiceUpdated,
    ]);
  });

  it('правка без поля ключа второй записи не пишет', async () => {
    // Отсутствие поля означает «не менять», и запись «изменён ключ» о
    // неменянном ключе была бы неправдой в неизменяемом журнале.
    await service.save(admin, kind, input);

    expect((await auditRows()).map((row) => row.action)).toEqual([
      AuditAction.ModelServiceUpdated,
    ]);
  });

  it('ключ не попадает в метаданные ни одним полем', async () => {
    await service.save(admin, kind, { ...input, secret: 'sk-утечка' });

    // Сравнение целиком, а не поиск отсутствия подстроки.
    expect(JSON.stringify(await auditRows())).not.toContain('sk-утечка');
    expect(await metadataOf(AuditAction.ModelServiceSecretSet)).toEqual({
      host: 'api.proxyapi.ru',
      action: 'set',
    });
  });

  it('убранный ключ отличается в журнале от поставленного', async () => {
    await service.save(admin, kind, { ...input, secret: null });

    expect(await metadataOf(AuditAction.ModelServiceSecretSet)).toEqual({
      host: 'api.proxyapi.ru',
      action: 'cleared',
    });
  });

  it('сброс к окружению пишет, что было', async () => {
    await service.save(admin, kind, input);
    await service.clear(admin, kind);

    expect((await auditRows()).at(-1)).toMatchObject({
      action: AuditAction.ModelServiceCleared,
      entityType: 'model_service',
      entityId: 'task_suggester',
    });
    expect(await metadataOf(AuditAction.ModelServiceCleared)).toEqual({
      previousHost: 'api.proxyapi.ru',
      previousModel: 'qwen/qwen3-max',
    });
  });

  it('сброс отсутствующей строки не падает и не пишет в журнал', async () => {
    await expect(service.clear(admin, kind)).resolves.not.toThrow();

    expect(await auditRows()).toHaveLength(0);
  });

  it('сохранение отдаёт действующую настройку без ключа', async () => {
    const result = await service.save(admin, kind, { ...input, secret: 'sk-утечка' });

    expect(Object.keys(result).filter((key) => /secret/i.test(key))).toEqual(['hasSecret']);
    expect(result).toMatchObject({ source: ModelServiceSource.Database, hasSecret: true });
  });

  it('замыкающая косая снимается прежде записи', async () => {
    // Иначе адаптер соберёт путь с двойной косой: он дописывает
    // `/chat/completions` сам.
    const result = await service.save(admin, kind, {
      ...input,
      baseUrl: 'https://api.proxyapi.ru/v1/',
    });

    expect(result.baseUrl).toBe('https://api.proxyapi.ru/v1');
  });

  it('проверка связи журналируется ПОСЛЕ вызова, с исходом', async () => {
    // Отличие от summary.tasks_suggested названо: гарантия «нет записи —
    // нет передачи» нужна передаче данных проекта, а здесь наружу уходит
    // константа из нашего исходника (дизайн, 8.5).
    await service.save(admin, kind, { ...input, secret: 'есть' });

    const result = await service.probe(admin, kind);

    expect(result).toEqual(probeResult);
    expect((await auditRows()).at(-1)).toMatchObject({
      action: AuditAction.ModelServiceProbed,
      entityType: 'model_service',
      entityId: 'task_suggester',
    });
    expect(await metadataOf(AuditAction.ModelServiceProbed)).toEqual({
      host: 'api.proxyapi.ru',
      model: 'qwen/qwen3-max',
      authScheme: ModelAuthScheme.Bearer,
      outcome: ModelProbeOutcome.Unauthorized,
      status: 401,
      durationMs: 12,
    });
  });

  it('проверка узла расшифровки идёт в его порт, а не в порт разбивки', async () => {
    // Ветка на узел, а не механизм на узел: ручка одна, журнал один,
    // отличается только то, у кого спрашивают (дизайн, 10.2).
    await service.save(admin, ModelServiceKind.Transcriber, {
      baseUrl: 'https://stt.api.cloud.yandex.net',
      authScheme: ModelAuthScheme.ApiKey,
      model: 'general',
      folder: 'каталог',
      placement: ModelServicePlacement.External,
      timeoutSeconds: 180,
      isEnabled: true,
      secret: 'ключ',
    });

    const result = await service.probe(admin, ModelServiceKind.Transcriber);

    expect(transcriberProbe).toHaveBeenCalledOnce();
    expect(probe).not.toHaveBeenCalled();
    expect(result.host).toBe('stt.api.cloud.yandex.net');
    expect((await auditRows()).at(-1)).toMatchObject({
      action: AuditAction.ModelServiceProbed,
      entityId: 'transcriber',
    });
  });

  it('проверка ненастроенного узла отвечает отказом и порт не зовёт', async () => {
    await expect(service.probe(admin, kind)).rejects.toMatchObject({
      response: { code: MODEL_SERVICE_NOT_CONFIGURED },
    });

    expect(probe).not.toHaveBeenCalled();
    expect(await auditRows()).toHaveLength(0);
  });

  it('негодный адрес отвергается до записи в базу', async () => {
    await expect(
      service.save(admin, kind, { ...input, baseUrl: 'https://api.example/v1?key=sk-secret' }),
    ).rejects.toMatchObject({ response: { code: MODEL_SERVICE_BAD_URL } });

    expect(await repository.find(testDb.db, kind)).toBeNull();
    expect(await auditRows()).toHaveLength(0);
  });

  it('внешний узел по http отвергается своим кодом', async () => {
    // Два отказа, а не один: «адрес негоден» и «ключ уйдёт по открытому
    // каналу» чинятся разным действием.
    await expect(
      service.save(admin, kind, { ...input, baseUrl: 'http://api.example/v1' }),
    ).rejects.toMatchObject({ response: { code: MODEL_SERVICE_INSECURE_URL } });
  });

  it('список отдаёт все узлы перечня, включая ненастроенные', async () => {
    const all = await service.list();

    expect(all.map((row) => row.kind)).toEqual(Object.values(ModelServiceKind));
    expect(all[0]?.source).toBe(ModelServiceSource.None);
  });

  it('узел по значению перечня отдаётся без ключа', async () => {
    await service.save(admin, kind, { ...input, secret: 'sk-утечка' });

    const found = await service.findByKind(kind);

    expect(JSON.stringify(found)).not.toContain('sk-утечка');
    expect(found.hasSecret).toBe(true);
  });
});
