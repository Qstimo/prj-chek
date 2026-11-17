import {
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  SubjectKind,
} from '@cairn/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { modelServices, subjects } from '../db/schema';

describe('права роли приложения на настройку служб модели', () => {
  let testDb: TestDatabase;
  let subjectId: string;

  /** Настройка целиком: каждая проверка правит её своим полем. */
  const input = {
    kind: ModelServiceKind.TaskSuggester,
    baseUrl: 'https://api.example/v1',
    authScheme: ModelAuthScheme.Bearer,
    model: 'm',
    placement: ModelServicePlacement.External,
  };

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'права@cairn.local' })
      .returning();
    subjectId = subject!.id;
  });

  it('роль приложения пишет, правит и удаляет настройку', async () => {
    // drizzle-kit GRANT не выдаёт, и без парной миграции приложение упало
    // бы на первом запросе отказом в правах. Проверка записью, а не
    // `count(*)`: урезанный до `GRANT SELECT` грант прошёл бы счётчик и
    // всплыл бы только в бою.
    const [saved] = await testDb.appDb
      .insert(modelServices)
      .values({ ...input, updatedBySubjectId: subjectId })
      .returning();
    expect(saved?.model).toBe('m');

    const [updated] = await testDb.appDb
      .update(modelServices)
      .set({ model: 'другая' })
      .where(eq(modelServices.kind, ModelServiceKind.TaskSuggester))
      .returning();
    expect(updated?.model).toBe('другая');

    await testDb.appDb
      .delete(modelServices)
      .where(eq(modelServices.kind, ModelServiceKind.TaskSuggester));
    expect(await testDb.rowsOf(modelServices)).toHaveLength(0);
  });

  it('вторая настройка того же узла базой не принимается', async () => {
    // Проверяется первичный ключ в применённой миграции, а не в схеме на
    // TypeScript: без него `ON CONFLICT (kind)` репозитория не на что
    // опереться (дизайн, 3.2).
    await testDb.appDb.insert(modelServices).values({ ...input, updatedBySubjectId: subjectId });

    await expect(
      testDb.appDb.insert(modelServices).values({ ...input, updatedBySubjectId: subjectId }),
    ).rejects.toThrow();
  });

  it('неположительный предел ожидания база не принимает', async () => {
    // CHECK обязан быть в применённой миграции: drizzle-kit переносит его
    // в SQL не всегда, и проверка на схеме в коде этого не заметила бы.
    await expect(
      testDb.appDb
        .insert(modelServices)
        .values({ ...input, timeoutSeconds: 0, updatedBySubjectId: subjectId }),
    ).rejects.toThrow(/model_services_timeout_positive/);
  });

  it('три перечня настройки в базе есть', async () => {
    // Структурная миграция создаёт их `CREATE TYPE`: забытый тип всплыл
    // бы первым же запросом в бою.
    await expect(
      testDb.appDb.execute(
        sql`SELECT 'task_suggester'::model_service_kind, 'api_key'::model_auth_scheme, 'local'::model_service_placement`,
      ),
    ).resolves.toBeDefined();
  });

  it('автор правки не удаляется, пока настройка на него ссылается', async () => {
    await testDb.appDb.insert(modelServices).values({ ...input, updatedBySubjectId: subjectId });

    await expect(
      testDb.db.delete(subjects).where(eq(subjects.id, subjectId)),
    ).rejects.toThrow();
  });
});
