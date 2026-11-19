import {
  ChronicleSource,
  SubjectKind,
  TranscriberKind,
  TranscriptionState,
} from '@cairn/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../../test/db-fixture';
import {
  chronicleEntries,
  projects,
  subjects,
  summaries,
  transcriptionJobs,
} from '../../db/schema';

/**
 * Что применённая миграция обязана держать сама.
 *
 * Привилегии и частичный уникум проверяются **поведением на живой базе**, а
 * не чтением схемы на TypeScript: `GRANT` drizzle-kit не выдаёт вовсе, а
 * предикат частичного индекса у drizzle — объект `SQL`, и сравнение его
 * строкой доказывало бы форму записи, а не правило. Образец —
 * `model-services.privileges.test.ts`.
 */
describe('применённая миграция расшифровок', () => {
  let testDb: TestDatabase;
  let projectId: string;
  let subjectId: string;
  let summaryId: string;

  /** Задача целиком, кроме того, что меняет каждая проверка. */
  function job(overrides: {
    summaryId: string | null;
    state: TranscriptionState;
  }): typeof transcriptionJobs.$inferInsert {
    return {
      projectId,
      requestedBySubjectId: subjectId,
      transcriber: TranscriberKind.External,
      model: 'general',
      uploadBytes: 566_231_040,
      uploadType: 'video/mp4',
      ...overrides,
    };
  }

  /** Вставка ролью приложения: так же, как это сделает репозиторий. */
  function insertJob(overrides: { summaryId: string | null; state: TranscriptionState }) {
    return testDb.appDb.insert(transcriptionJobs).values(job(overrides)).returning();
  }

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

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'cairn', name: 'CAIRN' })
      .returning();
    projectId = project!.id;

    const [entry] = await testDb.db
      .insert(chronicleEntries)
      .values({
        projectId,
        occurredOn: '2026-11-17',
        title: 'Созвон по релизу',
        content: 'расшифровка',
        source: ChronicleSource.Summary,
        createdBySubjectId: subjectId,
      })
      .returning();

    const [summary] = await testDb.db
      .insert(summaries)
      .values({
        projectId,
        chronicleEntryId: entry!.id,
        createdBySubjectId: subjectId,
      })
      .returning();
    summaryId = summary!.id;
  });

  it('роль приложения пишет, правит и удаляет задачу', async () => {
    // Без парной миграции привилегий приложение упало бы на первой
    // загрузке записи отказом в правах. Проверка записью, а не
    // `count(*)`: урезанный до `GRANT SELECT` грант прошёл бы счётчик и
    // всплыл бы только в бою.
    const [saved] = await insertJob({ summaryId: null, state: TranscriptionState.Queued });
    expect(saved?.state).toBe(TranscriptionState.Queued);

    const [updated] = await testDb.appDb
      .update(transcriptionJobs)
      .set({ state: TranscriptionState.Extracting })
      .where(eq(transcriptionJobs.id, saved!.id))
      .returning();
    expect(updated?.state).toBe(TranscriptionState.Extracting);

    await testDb.appDb.delete(transcriptionJobs).where(eq(transcriptionJobs.id, saved!.id));
    expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
  });

  it('оба перечня расшифровки в базе есть', async () => {
    // Структурная миграция создаёт их `CREATE TYPE`: забытый тип всплыл
    // бы первым же запросом в бою.
    await expect(
      testDb.appDb.execute(
        sql`SELECT 'external'::transcriber_kind, 'extracting'::transcription_state`,
      ),
    ).resolves.toBeDefined();
  });

  it('вторая незакрытая расшифровка по саммари не вставляется', async () => {
    await insertJob({ summaryId, state: TranscriptionState.Running });

    await expect(insertJob({ summaryId, state: TranscriptionState.Queued })).rejects.toThrow();
  });

  it('во время извлечения вторая расшифровка не вставляется', async () => {
    // Сторож предиката: если `extracting` выпадет из списка состояний,
    // этот тест — единственное, что это заметит, и он поймает самую
    // дорогую ошибку (два ffmpeg и две записи в один content).
    await insertJob({ summaryId, state: TranscriptionState.Extracting });

    await expect(insertJob({ summaryId, state: TranscriptionState.Queued })).rejects.toThrow();
  });

  it('во время отправки вторая расшифровка не вставляется', async () => {
    // Второй сторож того же предиката: `sending` — состояние, в котором
    // байты уже в пути, и вторая задача означала бы вторую передачу
    // созвона наружу.
    await insertJob({ summaryId, state: TranscriptionState.Sending });

    await expect(insertJob({ summaryId, state: TranscriptionState.Queued })).rejects.toThrow();
  });

  it('после закрытия первой вторая вставляется', async () => {
    // «Расшифровать снова» обязано работать: иначе уникум запрещал бы не
    // гонку, а саму возможность повторить.
    await insertJob({ summaryId, state: TranscriptionState.Failed });

    await expect(insertJob({ summaryId, state: TranscriptionState.Queued })).resolves.toBeDefined();
  });

  it('после успеха первой вторая тоже вставляется', async () => {
    await insertJob({ summaryId, state: TranscriptionState.Done });

    await expect(insertJob({ summaryId, state: TranscriptionState.Queued })).resolves.toBeDefined();
  });

  it('первых расшифровок без саммари может идти несколько', async () => {
    // NULL в уникуме не конфликтует с NULL — это ровно нужное поведение:
    // три загруженные записи это три будущих саммари.
    await insertJob({ summaryId: null, state: TranscriptionState.Queued });

    await expect(
      insertJob({ summaryId: null, state: TranscriptionState.Queued }),
    ).resolves.toBeDefined();
  });

  it('саммари не удаляется, пока задача на него ссылается', async () => {
    // `restrict`, а не каскад: уборка явная, и без неё удаление саммари
    // упёрлось бы в целостность — ровно это и правит задача 8.
    await insertJob({ summaryId, state: TranscriptionState.Done });

    await expect(testDb.db.delete(summaries).where(eq(summaries.id, summaryId))).rejects.toThrow();
  });

  it('попросивший субъект не удаляется, пока задача на него ссылается', async () => {
    await insertJob({ summaryId: null, state: TranscriptionState.Queued });

    await expect(testDb.db.delete(subjects).where(eq(subjects.id, subjectId))).rejects.toThrow();
  });

  it('день события хранится строкой, а не сдвигается часовым поясом', async () => {
    // Тот же тип, что у `chronicle_entries.occurred_on`: иначе день по
    // дороге сменил бы представление.
    const [saved] = await testDb.appDb
      .insert(transcriptionJobs)
      .values({ ...job({ summaryId: null, state: TranscriptionState.Queued }), occurredOn: '2026-11-17' })
      .returning();

    expect(saved?.occurredOn).toBe('2026-11-17');
  });
});
