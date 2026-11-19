import { randomBytes } from 'node:crypto';

import {
  MODEL_SERVICE_BASE_URL_MISSING,
  MODEL_SERVICE_DISABLED,
  MODEL_SERVICE_SECRET_MISSING,
  MODEL_SERVICE_SECRET_UNDECRYPTABLE,
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  SubjectKind,
  type ModelServiceUpdate,
} from '@cairn/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { CryptoService } from '../crypto/crypto.service';
import { modelServices, subjects } from '../db/schema';
import {
  SUGGESTER_API_KEY_ENV,
  SUGGESTER_AUTH_SCHEME_ENV,
  SUGGESTER_BASE_URL_ENV,
  SUGGESTER_KIND_ENV,
  SUGGESTER_MODEL_ENV,
  SUGGESTER_NODE_ENV_NAMES,
} from '../summaries/suggester/settings';
import { ModelServiceSettingsService } from './model-service-settings.service';
import { ModelServicesRepository } from './model-services.repository';

describe('ModelServiceSettingsService', () => {
  let testDb: TestDatabase;
  let repository: ModelServicesRepository;
  let service: ModelServiceSettingsService;
  let subjectId: string;
  let saved: Record<string, string | undefined>;

  const kind = ModelServiceKind.TaskSuggester;

  /** Полная настройка узла: каждая проверка меняет в ней одно поле. */
  const input: ModelServiceUpdate = {
    baseUrl: 'https://iz-bazy.example/v1',
    authScheme: ModelAuthScheme.Bearer,
    model: 'qwen/qwen3-max',
    folder: null,
    placement: ModelServicePlacement.External,
    timeoutSeconds: 60,
    isEnabled: true,
  };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new ModelServicesRepository(
      testDb.db,
      new CryptoService(randomBytes(32).toString('base64')),
    );
    service = new ModelServiceSettingsService(testDb.db, repository);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ@cairn.local' })
      .returning();
    subjectId = subject!.id;

    // Чистое окружение на каждую проверку: ключ, оставленный в оболочке
    // разработчика, включал бы узел там, где проверяется ненастроенный.
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

  it('без строки берёт настройку из окружения целиком', async () => {
    // Установки, собранные по действующему README, продолжают работать
    // без единой правки (дизайн, 2.1).
    process.env[SUGGESTER_API_KEY_ENV] = 'из-окружения';
    process.env[SUGGESTER_MODEL_ENV] = 'из-окружения-модель';

    const resolved = await service.resolve(kind);

    expect(resolved.source).toBe(ModelServiceSource.Environment);
    expect(resolved.secret).toBe('из-окружения');
    expect(resolved.model).toBe('из-окружения-модель');
    expect(resolved.isOperational).toBe(true);
  });

  it('строка перебивает окружение', async () => {
    process.env[SUGGESTER_BASE_URL_ENV] = 'https://iz-okruzheniya.example/v1';
    process.env[SUGGESTER_API_KEY_ENV] = 'из-окружения';
    await repository.save(testDb.db, kind, subjectId, { ...input, secret: 'из-базы' });

    const resolved = await service.resolve(kind);

    expect(resolved.source).toBe(ModelServiceSource.Database);
    expect(resolved.baseUrl).toBe('https://iz-bazy.example/v1');
    expect(resolved.secret).toBe('из-базы');
    expect(resolved.host).toBe('iz-bazy.example');
  });

  it('пустой ключ в строке НЕ доливается из окружения', async () => {
    // Главный инвариант дизайна (2.1). Доливание вернуло бы передачу
    // наружу человеку, который очистил поле намеренно.
    await repository.save(testDb.db, kind, subjectId, { ...input, secret: null });
    process.env[SUGGESTER_API_KEY_ENV] = 'из-окружения';

    const resolved = await service.resolve(kind);

    expect(resolved.secret).toBeNull();
    expect(resolved.isOperational).toBe(false);
    expect(resolved.blockedBy).toBe(MODEL_SERVICE_SECRET_MISSING);
  });

  it('пустая модель в строке не доливается тем же правилом', async () => {
    // Правило — на узел целиком, а не на одно поле ключа: любое
    // доливание возвращает «берёт не то, что я вписал» изнутри.
    await repository.save(testDb.db, kind, subjectId, { ...input, model: 'из-базы-модель' });
    process.env[SUGGESTER_MODEL_ENV] = 'из-окружения-модель';

    expect((await service.resolve(kind)).model).toBe('из-базы-модель');
  });

  it('ни строки, ни полного окружения — узел не настроен', async () => {
    const resolved = await service.resolve(kind);

    expect(resolved.source).toBe(ModelServiceSource.None);
    expect(resolved.isOperational).toBe(false);
    expect(resolved.blockedBy).toBe(MODEL_SERVICE_SECRET_MISSING);
  });

  it('локальный узел окружения без адреса называет недостающий адрес', async () => {
    process.env[SUGGESTER_KIND_ENV] = 'local';
    process.env[SUGGESTER_AUTH_SCHEME_ENV] = 'none';

    const resolved = await service.resolve(kind);

    expect(resolved.source).toBe(ModelServiceSource.None);
    expect(resolved.blockedBy).toBe(MODEL_SERVICE_BASE_URL_MISSING);
  });

  it('выключатель окружения не выглядит неполной настройкой', async () => {
    // `off` — решение человека, и назвать его «не хватает ключа» значило
    // бы послать администратора искать не то.
    process.env[SUGGESTER_KIND_ENV] = 'off';
    process.env[SUGGESTER_API_KEY_ENV] = 'из-окружения';

    const resolved = await service.resolve(kind);

    expect(resolved.source).toBe(ModelServiceSource.Environment);
    expect(resolved.isEnabled).toBe(false);
    expect(resolved.isOperational).toBe(false);
    expect(resolved.blockedBy).toBe(MODEL_SERVICE_DISABLED);
  });

  it('снятая галочка выключает настроенный узел', async () => {
    await repository.save(testDb.db, kind, subjectId, {
      ...input,
      isEnabled: false,
      secret: 'есть',
    });

    const resolved = await service.resolve(kind);

    // isEnabled и isOperational не сводятся в одно поле: «выключено
    // вами» и «не хватает ключа» чинятся разным действием (дизайн, 4.1).
    expect(resolved.isEnabled).toBe(false);
    expect(resolved.isOperational).toBe(false);
    expect(resolved.blockedBy).toBe(MODEL_SERVICE_DISABLED);
  });

  it('нерасшифровываемый ключ выключает узел и называет причину', async () => {
    await repository.save(testDb.db, kind, subjectId, { ...input, secret: 'есть' });
    await testDb.db.update(modelServices).set({ secretEncrypted: 'v1:мусор:мусор:мусор' });

    const resolved = await service.resolve(kind);

    expect(resolved.isOperational).toBe(false);
    expect(resolved.blockedBy).toBe(MODEL_SERVICE_SECRET_UNDECRYPTABLE);
  });

  it('схема none делает узел рабочим без ключа и из базы тоже', async () => {
    await repository.save(testDb.db, kind, subjectId, {
      ...input,
      baseUrl: 'http://llm.internal:8000/v1',
      authScheme: ModelAuthScheme.None,
      placement: ModelServicePlacement.Local,
    });

    const resolved = await service.resolve(kind);

    expect(resolved.isOperational).toBe(true);
    expect(resolved.secret).toBeNull();
  });

  it('проекция для экрана ключа не содержит', async () => {
    await repository.save(testDb.db, kind, subjectId, { ...input, secret: 'sk-утечка' });

    const settings = await service.settings(kind);

    // Сравнение имён полей целиком, а не поиск отсутствия подстроки:
    // новая ручка не должна получать ключ в ответе бесплатно (дизайн, 5.2).
    expect(Object.keys(settings).filter((key) => /secret/i.test(key))).toEqual(['hasSecret']);
    expect(JSON.stringify(settings)).not.toContain('sk-утечка');
    expect(settings.hasSecret).toBe(true);
  });

  it('об окружении проекция говорит одной биркой источника, без имён переменных', async () => {
    await repository.save(testDb.db, kind, subjectId, input);
    process.env[SUGGESTER_API_KEY_ENV] = 'из-окружения';

    const settings = await service.settings(kind);

    // Бирка отвечает на тот же вопрос, а поле в ответе, которое никто не
    // показывает, со следующей правкой начнут показывать по ошибке
    // (дизайн 2026-11-19, 5.3). Сравнение по именам полей, а не по
    // значению: вернуть поле обратно должно быть видно отсюда.
    expect(settings.source).toBe(ModelServiceSource.Database);
    expect(Object.keys(settings)).not.toContain('envVarNames');
    expect(Object.keys(settings)).not.toContain('hasEnvironmentSettings');
    expect(JSON.stringify(settings)).not.toContain(SUGGESTER_API_KEY_ENV);
  });

  it('проекция называет, кто и когда правил настройку', async () => {
    await repository.save(testDb.db, kind, subjectId, input);

    const settings = await service.settings(kind);

    expect(settings.updatedByLabel).toBe('админ@cairn.local');
    expect(settings.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('список отдаёт все узлы перечня, включая ненастроенные', async () => {
    // Пустой список выглядел бы как «настраивать нечего» (дизайн, 5.1).
    const all = await service.allSettings();

    expect(all.map((settings) => settings.kind)).toEqual(Object.values(ModelServiceKind));
    expect(all[0]?.source).toBe(ModelServiceSource.None);
  });
});
