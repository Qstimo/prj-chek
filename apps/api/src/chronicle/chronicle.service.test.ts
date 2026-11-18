import { SubjectKind, TranscriberKind, TranscriptionState } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, projects, subjects, summaries, transcriptionJobs, users } from '../db/schema';
import { RecordingStore } from '../summaries/transcription/recording-store';
import { ChronicleRepository } from './chronicle.repository';
import { ChronicleService } from './chronicle.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис хроники', () => {
  let testDb: TestDatabase;
  let service: ChronicleService;
  let store: StubStore;
  let projectId: string;
  let subjectId: string;

  /**
   * Хранилище, которое помнит момент вызова.
   *
   * Момент проверяется **чужим соединением**: роль приложения не видит
   * незафиксированного удаления, поэтому «саммари уже нет для appDb»
   * означает ровно «транзакция зафиксирована». Сравнение порядка вызовов
   * было бы договорённостью, а это — наблюдение.
   */
  class StubStore extends RecordingStore {
    readonly removed: string[] = [];
    failOnRemove = false;
    sawCommitted: boolean | null = null;

    override async remove(relativePath: string): Promise<void> {
      this.removed.push(relativePath);

      const rows = await testDb.appDb.select({ id: summaries.id }).from(summaries);
      this.sawCommitted = rows.length === 0;

      if (this.failOnRemove) {
        throw new Error('том не смонтирован');
      }
    }
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    store = new StubStore();

    service = new ChronicleService(
      testDb.db,
      new ChronicleRepository(testDb.db, new AccessService(testDb.db)),
      new AuditService(),
      store,
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    store.removed.length = 0;
    store.failOnRemove = false;
    store.sawCommitted = null;

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db.insert(users).values({
      subjectId,
      email: 'admin@cairn.local',
      passwordHash: 'хэш',
      isSuperadmin: true,
    });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  const admin = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  const INPUT = {
    occurredOn: '2026-08-27',
    title: 'Встреча по релизу',
    content: 'Решили выпускать в пятницу.',
  };

  async function entriesOf(action: AuditAction) {
    return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
  }

  it('пишет создание в журнал', async () => {
    await service.create(admin(), projectId, INPUT);

    const [entry] = await entriesOf(AuditAction.ChronicleEntryCreated);

    expect(entry?.projectId).toBe(projectId);
    expect(entry?.metadata).toMatchObject({ title: 'Встреча по релизу' });
  });

  it('пишет правку с перечнем полей, но без содержимого', async () => {
    const created = await service.create(admin(), projectId, INPUT);

    await service.update(admin(), projectId, created.id, { content: 'Перенесли на понедельник' });

    const [entry] = await entriesOf(AuditAction.ChronicleEntryUpdated);

    expect(entry?.metadata).toMatchObject({ fields: ['content'] });
    expect(JSON.stringify(entry?.metadata)).not.toContain('понедельник');
  });

  it('пишет удаление вместе с заголовком и датой', async () => {
    const created = await service.create(admin(), projectId, INPUT);

    await service.remove(admin(), projectId, created.id);

    const [entry] = await entriesOf(AuditAction.ChronicleEntryDeleted);

    expect(entry?.metadata).toMatchObject({
      title: 'Встреча по релизу',
      occurredOn: '2026-08-27',
    });
  });

  it('не пишет в журнал, когда изменение не состоялось', async () => {
    await expect(
      service.remove(admin(), projectId, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow();

    expect(await entriesOf(AuditAction.ChronicleEntryDeleted)).toHaveLength(0);
  });

  describe('удаление записи с записью созвона', () => {
    /** Запись, саммари и расшифровка над ним: на томе два файла. */
    async function entryWithRecording(): Promise<{ entryId: string; jobId: string }> {
      const entry = await service.create(admin(), projectId, INPUT);
      const [summary] = await testDb.db
        .insert(summaries)
        .values({ projectId, chronicleEntryId: entry.id, createdBySubjectId: subjectId })
        .returning();
      const jobId = crypto.randomUUID();
      await testDb.db.insert(transcriptionJobs).values({
        id: jobId,
        projectId,
        summaryId: summary!.id,
        requestedBySubjectId: subjectId,
        state: TranscriptionState.Done,
        transcriber: TranscriberKind.External,
        model: 'general',
        uploadPath: `${jobId}.mp4`,
        uploadBytes: 566_231_040,
        uploadType: 'video/mp4',
        audioPath: `${jobId}.opus`,
        audioBytes: 11_534_336,
        audioType: 'audio/ogg',
      });

      return { entryId: entry.id, jobId };
    }

    it('файл убирается после фиксации транзакции, а не внутри', async () => {
      // Порядок обязателен: сначала commit, потом unlink. Удаление файла
      // не откатывается, и обратный порядок унёс бы запись у саммари,
      // удаление которого потом откатилось.
      const { entryId, jobId } = await entryWithRecording();

      await service.remove(admin(), projectId, entryId);

      expect(store.removed).toEqual([`${jobId}.mp4`, `${jobId}.opus`]);
      expect(store.sawCommitted).toBe(true);
    });

    it('сбой удаления файла не валит удаление записи', async () => {
      // Осиротевший файл виден предупреждением в логе, места занимает
      // столько же и данных не раскрывает. Откатывать удаление из-за него
      // значило бы сделать запись неудаляемой из-за файла.
      const { entryId } = await entryWithRecording();
      store.failOnRemove = true;

      await expect(service.remove(admin(), projectId, entryId)).resolves.toBeUndefined();
      expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
    });

    it('у записи без созвона хранилище не зовётся вовсе', async () => {
      const entry = await service.create(admin(), projectId, INPUT);

      await service.remove(admin(), projectId, entry.id);

      expect(store.removed).toEqual([]);
    });
  });
});
