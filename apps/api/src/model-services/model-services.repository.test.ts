import { randomBytes } from 'node:crypto';

import {
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  type ModelServiceUpdate,
  SubjectKind,
} from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { CryptoService } from '../crypto/crypto.service';
import { modelServices, subjects } from '../db/schema';
import { ModelServicesRepository } from './model-services.repository';

describe('ModelServicesRepository', () => {
  let testDb: TestDatabase;
  let repository: ModelServicesRepository;
  let subjectId: string;

  const kind = ModelServiceKind.TaskSuggester;

  /** Полная настройка без ключа: поле `secret` каждая проверка ставит сама. */
  const input: ModelServiceUpdate = {
    baseUrl: 'https://api.proxyapi.ru/v1',
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
  });

  it('ключ в базе лежит шифрованным и расшифровывается обратно', async () => {
    await repository.save(testDb.db, kind, subjectId, {
      ...input,
      secret: 'sk-очень-секретный',
    });

    const [row] = await testDb.rowsOf(modelServices);
    // Формат тот же, что у переменных проекта: второго механизма
    // шифрования не появляется (дизайн, 3.3).
    expect(row?.secretEncrypted).toMatch(/^v1:/);
    expect(row?.secretEncrypted).not.toContain('sk-очень-секретный');

    const resolved = await repository.find(testDb.db, kind);
    expect(resolved?.secret).toBe('sk-очень-секретный');
    expect(resolved?.hasSecret).toBe(true);
  });

  it('вторая запись правит ту же строку, а не создаёт вторую', async () => {
    await repository.save(testDb.db, kind, subjectId, input);
    await repository.save(testDb.db, kind, subjectId, { ...input, model: 'другая' });

    expect(await testDb.rowsOf(modelServices)).toHaveLength(1);
    expect((await repository.find(testDb.db, kind))?.model).toBe('другая');
  });

  it('отсутствие поля ключа оставляет прежний ключ', async () => {
    await repository.save(testDb.db, kind, subjectId, { ...input, secret: 'первый' });
    await repository.save(testDb.db, kind, subjectId, { ...input, model: 'другая' });

    expect((await repository.find(testDb.db, kind))?.secret).toBe('первый');
  });

  it('null в ключе убирает его', async () => {
    await repository.save(testDb.db, kind, subjectId, { ...input, secret: 'первый' });
    await repository.save(testDb.db, kind, subjectId, { ...input, secret: null });

    const resolved = await repository.find(testDb.db, kind);
    expect(resolved?.secret).toBeNull();
    expect(resolved?.hasSecret).toBe(false);
  });

  it('негодный ключ шифрования не роняет чтение', async () => {
    // Экран администрирования — единственное место, с которого это
    // чинится, и ронять его ошибкой расшифровки значит отобрать
    // инструмент починки (дизайн, 3.7). Расхождение с
    // VariablesRepository названо и обосновано там же.
    await repository.save(testDb.db, kind, subjectId, { ...input, secret: 'первый' });
    await testDb.db.update(modelServices).set({ secretEncrypted: 'v1:мусор:мусор:мусор' });

    const resolved = await repository.find(testDb.db, kind);
    expect(resolved?.secret).toBeNull();
    expect(resolved?.isSecretBroken).toBe(true);
    // «Ключ есть, но негоден» и «ключа нет» — разные состояния: первое
    // чинится ключом шифрования, второе — вписыванием ключа службы.
    expect(resolved?.hasSecret).toBe(true);
  });

  it('называет, кто и когда правил настройку', async () => {
    // Метка субъекта соединением, а не денормализацией: второе поле имени
    // разошлось бы с показанным в журнале (дизайн, 3.1).
    await repository.save(testDb.db, kind, subjectId, input);

    const resolved = await repository.find(testDb.db, kind);
    expect(resolved?.updatedByLabel).toBe('админ@cairn.local');
    expect(resolved?.updatedAt).toBeInstanceOf(Date);
  });

  it('отсутствующая настройка читается как null, а не как пустая', async () => {
    expect(await repository.find(testDb.db, kind)).toBeNull();
  });

  it('удаление убирает строку и отсутствующую строку терпит', async () => {
    await repository.save(testDb.db, kind, subjectId, input);
    await repository.remove(testDb.db, kind);

    expect(await testDb.rowsOf(modelServices)).toHaveLength(0);
    await expect(repository.remove(testDb.db, kind)).resolves.not.toThrow();
  });

  it('список отдаёт только заведённые настройки', async () => {
    // Ненастроенные узлы дописывает служба разрешения: репозиторий знает
    // только о том, что в базе есть.
    expect(await repository.findAll(testDb.db)).toHaveLength(0);

    await repository.save(testDb.db, kind, subjectId, input);

    expect((await repository.findAll(testDb.db)).map((row) => row.kind)).toEqual([kind]);
  });
});
