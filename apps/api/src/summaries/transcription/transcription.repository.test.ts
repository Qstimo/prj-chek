import {
  AccessLevel,
  RECORDING_MISSING,
  Section,
  SubjectKind,
  TRANSCRIPTION_ALREADY_RUNNING,
  TRANSCRIPTION_TIMED_OUT,
  TranscriberKind,
  TranscriptionState,
  type SummaryCreate,
} from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { InsufficientLevelError, SectionNotVisibleError } from '../../access/access.errors';
import { AccessService } from '../../access/access.service';
import type { RequestSubject } from '../../access/access.types';
import { ChronicleRepository } from '../../chronicle/chronicle.repository';
import { grants, projects, subjects, transcriptionJobs, users } from '../../db/schema';
import { RoadmapRepository } from '../../roadmap/roadmap.repository';
import { startTestDatabase, type TestDatabase } from '../../../test/db-fixture';
import { SummariesRepository } from '../summaries.repository';
import { TranscriptionRepository, type TranscriptionCreate } from './transcription.repository';

const SUMMARY_INPUT: SummaryCreate = {
  occurredOn: '2026-11-17',
  title: 'Созвон по релизу',
  text: 'обсудили сроки',
};

/** Чем расшифровка настроена на момент создания задачи. */
const SERVICE = { transcriber: TranscriberKind.External, model: 'general' };

describe('репозиторий расшифровок', () => {
  let testDb: TestDatabase;
  let repository: TranscriptionRepository;
  let summaries: SummariesRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;
  let outsiderSubjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const access = new AccessService(testDb.db);
    const chronicle = new ChronicleRepository(testDb.db, access);
    summaries = new SummariesRepository(
      testDb.db,
      access,
      chronicle,
      new RoadmapRepository(testDb.db, access),
    );
    repository = new TranscriptionRepository(testDb.db, access);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    adminSubjectId = adminSubject!.id;
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubjectId,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'user@cairn.local', passwordHash: 'хэш' });

    const [outsider] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'nikto@cairn.local' })
      .returning();
    outsiderSubjectId = outsider!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: outsiderSubjectId, email: 'nikto@cairn.local', passwordHash: 'хэш' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'chuzhoj', name: 'Чужой' })
      .returning();
    otherProjectId = other!.id;
  });

  const writer = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  const outsider = (): RequestSubject => ({
    id: outsiderSubjectId,
    kind: SubjectKind.User,
    label: 'nikto@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  const admin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  async function grant(level: AccessLevel, target = projectId): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId: target,
      section: Section.Chronicle,
      level,
      grantedBy: adminUserId,
    });
  }

  /** Паспорт первой расшифровки: файл уже дотёк на том. */
  function input(overrides: Partial<TranscriptionCreate> = {}): TranscriptionCreate {
    const id = crypto.randomUUID();

    return {
      id,
      occurredOn: '2026-11-17',
      title: 'Созвон по релизу',
      uploadPath: `${id}.mp4`,
      uploadBytes: 566_231_040,
      uploadType: 'video/mp4',
      ...SERVICE,
      ...overrides,
    };
  }

  /** Задача от лица суперадмина: подготовка данных, а не проверка прав. */
  async function createJob(overrides: Partial<TranscriptionCreate> = {}) {
    return testDb.db.transaction((tx) =>
      repository.create(admin(), tx, projectId, input(overrides)),
    );
  }

  /** Саммари с текстом: над ним идут повторные расшифровки. */
  async function createSummary(): Promise<string> {
    const created = await testDb.db.transaction((tx) =>
      summaries.create(admin(), tx, projectId, SUMMARY_INPUT),
    );

    return created.id;
  }

  /** Строка задачи прямо из базы: проверки переходов смотрят её колонки. */
  async function rowOf(jobId: string) {
    const [row] = await testDb.db
      .select()
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.id, jobId));

    return row;
  }

  /** Привязывает задачу к саммари и ставит ей дорожку: образец успеха. */
  async function attach(
    jobId: string,
    summaryId: string,
    patch: Partial<typeof transcriptionJobs.$inferInsert> = {},
  ): Promise<void> {
    await testDb.db
      .update(transcriptionJobs)
      .set({
        summaryId,
        audioPath: `${jobId}.opus`,
        audioBytes: 11_534_336,
        audioType: 'audio/ogg',
        state: TranscriptionState.Done,
        ...patch,
      })
      .where(eq(transcriptionJobs.id, jobId));
  }

  describe('создание задачи', () => {
    it('заводит задачу правом записи на хронику', async () => {
      await grant(AccessLevel.Write);

      const job = await testDb.db.transaction((tx) =>
        repository.create(writer(), tx, projectId, input()),
      );

      expect(job.state).toBe(TranscriptionState.Queued);
      expect(job.summaryId).toBeNull();
      expect(job.sentAt).toBeNull();
      expect(job.audioBytes).toBeNull();
      expect(job.hasRecording).toBe(false);
      expect(job.projectName).toBe('Проект');
    });

    it('помнит, кто попросил: прогон будет работать его правом', async () => {
      await grant(AccessLevel.Write);

      const job = await testDb.db.transaction((tx) =>
        repository.create(writer(), tx, projectId, input()),
      );

      expect((await rowOf(job.id))?.requestedBySubjectId).toBe(subjectId);
    });

    it('уровня чтения хроники не хватает', async () => {
      // Загрузка записи открывается тем же правом, что создание саммари.
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) => repository.create(writer(), tx, projectId, input())),
      ).rejects.toThrow(InsufficientLevelError);
    });

    it('без выдачи на хронику проект не раскрывается', async () => {
      await expect(
        testDb.db.transaction((tx) => repository.create(outsider(), tx, projectId, input())),
      ).rejects.toThrow(SectionNotVisibleError);
    });
  });

  describe('чтение задач', () => {
    it('задача чужого проекта выглядит несуществующей', async () => {
      // Выборка по (id, project_id), как requireEntry в хронике.
      await grant(AccessLevel.Write);
      await grant(AccessLevel.Write, otherProjectId);
      const job = await createJob();

      await expect(repository.findById(writer(), otherProjectId, job.id)).rejects.toThrow(
        SectionNotVisibleError,
      );
    });

    it('очередь проекта отдаёт незакрытые и неудавшиеся, без done', async () => {
      // Успешная расшифровка видна саммари в истории; две строки об одном
      // были бы двумя правдами.
      await grant(AccessLevel.Write);
      const running = await createJob();
      const failed = await createJob();
      const done = await createJob();
      await testDb.db
        .update(transcriptionJobs)
        .set({ state: TranscriptionState.Running })
        .where(eq(transcriptionJobs.id, running.id));
      await testDb.db
        .update(transcriptionJobs)
        .set({ state: TranscriptionState.Failed })
        .where(eq(transcriptionJobs.id, failed.id));
      await testDb.db
        .update(transcriptionJobs)
        .set({ state: TranscriptionState.Done })
        .where(eq(transcriptionJobs.id, done.id));

      const queue = await repository.findQueue(writer(), projectId);

      expect(queue.map((job) => job.id).sort()).toEqual([failed.id, running.id].sort());
    });

    it('очередь по всем проектам фильтруется выдачами на хронику', async () => {
      // Функция доступа существующая: projectIdsWithLevel завела первая
      // итерация, новой не появляется.
      await grant(AccessLevel.Write);
      await createJob();
      await testDb.db.transaction((tx) =>
        repository.create(admin(), tx, otherProjectId, input()),
      );

      const queue = await repository.findOverview(writer());

      expect(queue).toHaveLength(1);
      expect(queue.every((job) => job.projectId === projectId)).toBe(true);
    });

    it('уровня чтения хроники не хватает и на очередь', async () => {
      await grant(AccessLevel.Read);

      await expect(repository.findQueue(writer(), projectId)).rejects.toThrow(
        InsufficientLevelError,
      );
    });

    it('отдаёт прогону незакрытые задачи без субъекта, старые первыми', async () => {
      // Прогон — не субъект: он собирает RequestSubject по
      // requested_by_subject_id и дальше работает им.
      await grant(AccessLevel.Write);
      const older = await createJob();
      const newer = await createJob();
      const done = await createJob();
      await testDb.db
        .update(transcriptionJobs)
        .set({ startedAt: new Date('2026-11-17T09:00:00Z') })
        .where(eq(transcriptionJobs.id, older.id));
      await testDb.db
        .update(transcriptionJobs)
        .set({ startedAt: new Date('2026-11-17T10:00:00Z') })
        .where(eq(transcriptionJobs.id, newer.id));
      await testDb.db
        .update(transcriptionJobs)
        .set({ state: TranscriptionState.Done })
        .where(eq(transcriptionJobs.id, done.id));

      const pending = await testDb.db.transaction((tx) => repository.pending(tx));

      expect(pending.map((job) => job.id)).toEqual([older.id, newer.id]);
    });
  });

  describe('повторная расшифровка', () => {
    it('берёт дорожку у первой, а не копирует файл', async () => {
      // У саммари, дошедшего до done, исходника уже нет (решение
      // владельца 2) — и это обычный случай, а не краевой: повтор
      // работает с дорожкой. Подсчёта ссылок нет, путь берётся как есть.
      await grant(AccessLevel.Write);
      const summaryId = await createSummary();
      const first = await createJob();
      await attach(first.id, summaryId, { uploadPath: null });

      const again = await testDb.db.transaction((tx) =>
        repository.createForSummary(writer(), tx, projectId, summaryId, SERVICE),
      );

      expect((await rowOf(again.id))?.audioPath).toBe(`${first.id}.opus`);
      expect((await rowOf(again.id))?.uploadPath).toBeNull();
      expect(again.occurredOn).toBeNull();
      expect(again.title).toBeNull();
      expect(again.summaryId).toBe(summaryId);
    });

    it('если исходник ещё есть, повтор наследует и его', async () => {
      // Такое бывает у саммари, чей текст уложен не первой попыткой: до
      // done исходник на месте, и новая задача несёт оба пути.
      await grant(AccessLevel.Write);
      const summaryId = await createSummary();
      const first = await createJob();
      await attach(first.id, summaryId);

      const again = await testDb.db.transaction((tx) =>
        repository.createForSummary(writer(), tx, projectId, summaryId, SERVICE),
      );

      expect((await rowOf(again.id))?.uploadPath).toBe(`${first.id}.mp4`);
    });

    it('повтор без дорожки отвергается, а без исходника — нет', async () => {
      // Спутать эти два случая значит сломать повтор навсегда: пустой
      // upload_path — обычное состояние, пустой audio_path — отказ.
      await grant(AccessLevel.Write);
      const summaryId = await createSummary();
      const first = await createJob();
      await attach(first.id, summaryId, { audioPath: null, uploadPath: null });

      await expect(
        testDb.db.transaction((tx) =>
          repository.createForSummary(writer(), tx, projectId, summaryId, SERVICE),
        ),
      ).rejects.toMatchObject({ code: RECORDING_MISSING });
    });

    it('повтор по саммари без единой расшифровки отвергается', async () => {
      // Текст вставили руками: расшифровывать нечего.
      await grant(AccessLevel.Write);
      const summaryId = await createSummary();

      await expect(
        testDb.db.transaction((tx) =>
          repository.createForSummary(writer(), tx, projectId, summaryId, SERVICE),
        ),
      ).rejects.toMatchObject({ code: RECORDING_MISSING });
    });

    it('повторная расшифровка при идущей отвергается', async () => {
      await grant(AccessLevel.Write);
      const summaryId = await createSummary();
      const first = await createJob();
      await attach(first.id, summaryId, { state: TranscriptionState.Running });

      await expect(
        testDb.db.transaction((tx) =>
          repository.createForSummary(writer(), tx, projectId, summaryId, SERVICE),
        ),
      ).rejects.toMatchObject({ code: TRANSCRIPTION_ALREADY_RUNNING });
    });

    it('саммари чужого проекта выглядит несуществующим', async () => {
      await grant(AccessLevel.Write);
      await grant(AccessLevel.Write, otherProjectId);
      const summaryId = await createSummary();

      await expect(
        testDb.db.transaction((tx) =>
          repository.createForSummary(writer(), tx, otherProjectId, summaryId, SERVICE),
        ),
      ).rejects.toThrow(SectionNotVisibleError);
    });
  });

  describe('переходы состояний', () => {
    it('переход в extracting захватывает работу, не трогая sentAt', async () => {
      // Захват, а не журналирование: наружу ничего не уходит, но без него
      // два тика двух экземпляров API запустили бы два ffmpeg на один
      // файл и писали бы в один и тот же выходной путь.
      await grant(AccessLevel.Write);
      const job = await createJob();

      await testDb.db.transaction((tx) => repository.markExtracting(tx, job.id));

      expect((await rowOf(job.id))?.state).toBe(TranscriptionState.Extracting);
      expect((await rowOf(job.id))?.sentAt).toBeNull();
    });

    it('готовая дорожка записывается вместе с возвратом в очередь', async () => {
      // Одной транзакцией: audio_* без возврата в queued читались бы как
      // «дорожка есть, а работа висит».
      await grant(AccessLevel.Write);
      const job = await createJob();
      await testDb.db.transaction((tx) => repository.markExtracting(tx, job.id));

      await testDb.db.transaction((tx) =>
        repository.markExtracted(tx, job.id, {
          path: `${job.id}.opus`,
          bytes: 11_534_336,
          type: 'audio/ogg',
        }),
      );

      expect((await rowOf(job.id))?.state).toBe(TranscriptionState.Queued);
      expect((await rowOf(job.id))?.audioBytes).toBe(11_534_336);
    });

    it('переход в sending невозможен без дорожки', async () => {
      // Охрана инварианта «наружу уходит только то, что лежит в
      // audio_path». Решение принимает prepareDecision, но забыть
      // решение можно, а охрану — нет.
      await grant(AccessLevel.Write);
      const job = await createJob();

      await expect(
        testDb.db.transaction((tx) =>
          repository.markSending(tx, job.id, { host: 'stt.api.cloud.yandex.net' }),
        ),
      ).rejects.toThrow();
    });

    it('переход в sending ставит момент отправки', async () => {
      await grant(AccessLevel.Write);
      const job = await createJob();
      await testDb.db
        .update(transcriptionJobs)
        .set({ audioPath: `${job.id}.opus`, audioBytes: 10, audioType: 'audio/ogg' })
        .where(eq(transcriptionJobs.id, job.id));

      await testDb.db.transaction((tx) =>
        repository.markSending(tx, job.id, { host: 'stt.api.cloud.yandex.net' }),
      );

      expect((await rowOf(job.id))?.state).toBe(TranscriptionState.Sending);
      expect((await rowOf(job.id))?.sentAt).not.toBeNull();
      expect((await rowOf(job.id))?.host).toBe('stt.api.cloud.yandex.net');
    });

    it('переход в running требует идентификатора операции', async () => {
      // Строка running без external_id — строка, которую нечем опросить.
      await grant(AccessLevel.Write);
      const job = await createJob();

      await expect(
        testDb.db.transaction((tx) => repository.markRunning(tx, job.id, '   ')),
      ).rejects.toThrow();
    });

    it('переход в running запоминает операцию провайдера', async () => {
      await grant(AccessLevel.Write);
      const job = await createJob();

      await testDb.db.transaction((tx) => repository.markRunning(tx, job.id, 'op-1'));

      expect((await rowOf(job.id))?.state).toBe(TranscriptionState.Running);
      expect((await rowOf(job.id))?.externalId).toBe('op-1');
    });

    it('закрытие неудачей пишет код и момент', async () => {
      await grant(AccessLevel.Write);
      const job = await createJob();

      await testDb.db.transaction((tx) =>
        repository.markFailed(tx, job.id, TRANSCRIPTION_TIMED_OUT),
      );

      expect((await rowOf(job.id))?.failureCode).toBe(TRANSCRIPTION_TIMED_OUT);
      expect((await rowOf(job.id))?.finishedAt).not.toBeNull();
    });

    it('неудача исходника не трогает', async () => {
      // Главный довод решения владельца 2 и его граница: повторить
      // попытку всегда есть из чего.
      await grant(AccessLevel.Write);
      const job = await createJob();

      await testDb.db.transaction((tx) =>
        repository.markFailed(tx, job.id, TRANSCRIPTION_TIMED_OUT),
      );

      expect((await rowOf(job.id))?.uploadPath).toBe(`${job.id}.mp4`);
    });
  });

  describe('укладка текста и уборка исходника', () => {
    it('укладка текста обнуляет путь исходника и отдаёт его вызывающему', async () => {
      // Исходник убирается при переходе в done (решение владельца 2).
      // Колонка обнуляется в транзакции, unlink идёт после фиксации —
      // поэтому путь возвращается наружу, а не удаляется здесь.
      await grant(AccessLevel.Write);
      const summaryId = await createSummary();
      const job = await createJob();
      await attach(job.id, summaryId, { state: TranscriptionState.Running });

      const removed = await testDb.db.transaction((tx) => repository.markDone(tx, job.id));

      expect(removed.sourcePath).toBe(`${job.id}.mp4`);

      const row = await rowOf(job.id);

      expect(row?.state).toBe(TranscriptionState.Done);
      expect(row?.uploadPath).toBeNull();
      expect(row?.audioPath).toBe(`${job.id}.opus`);
      expect(row?.uploadBytes).toBe(566_231_040);
    });

    it('не отдаёт на уборку единственный файл', async () => {
      // Загруженный mp3 и есть дорожка: убрать его значило бы унести
      // единственную запись саммари — тихо и необратимо.
      await grant(AccessLevel.Write);
      const job = await createJob({ uploadType: 'audio/mpeg' });
      const uploadPath = (await rowOf(job.id))?.uploadPath;
      await testDb.db
        .update(transcriptionJobs)
        .set({ audioPath: uploadPath, audioBytes: job.uploadBytes, audioType: 'audio/mpeg' })
        .where(eq(transcriptionJobs.id, job.id));

      const removed = await testDb.db.transaction((tx) => repository.markDone(tx, job.id));

      expect(removed.sourcePath).toBeNull();
      expect((await rowOf(job.id))?.audioPath).not.toBeNull();
      expect((await rowOf(job.id))?.uploadPath).not.toBeNull();
    });

    it('у повторной расшифровки убирать нечего: исходника нет с первого успеха', async () => {
      // Повтор работает с дорожкой, и это не краевой случай, а обычный.
      await grant(AccessLevel.Write);
      const summaryId = await createSummary();
      const first = await createJob();
      await attach(first.id, summaryId, { uploadPath: null });
      const again = await testDb.db.transaction((tx) =>
        repository.createForSummary(writer(), tx, projectId, summaryId, SERVICE),
      );

      const removed = await testDb.db.transaction((tx) => repository.markDone(tx, again.id));

      expect(removed.sourcePath).toBeNull();
    });
  });

  describe('удаление задачи', () => {
    it('удаление задачи отдаёт пути файлов вызывающему', async () => {
      // Файлы удаляются после фиксации транзакции, не внутри: удаление
      // файла не откатывается.
      await grant(AccessLevel.Write);
      const job = await createJob();
      await testDb.db
        .update(transcriptionJobs)
        .set({ audioPath: `${job.id}.opus`, audioBytes: 10, audioType: 'audio/ogg' })
        .where(eq(transcriptionJobs.id, job.id));

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(writer(), tx, projectId, job.id),
      );

      expect(removed.mediaPaths).toEqual([`${job.id}.mp4`, `${job.id}.opus`]);
      expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
    });

    it('у закончившейся задачи остаётся один путь — дорожка', async () => {
      // Исходник убран на done, и это нормальный случай, а не краевой:
      // у живого саммари, как правило, удалять нечего, кроме дорожки.
      await grant(AccessLevel.Write);
      const summaryId = await createSummary();
      const job = await createJob();
      await attach(job.id, summaryId, { uploadPath: null });

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(writer(), tx, projectId, job.id),
      );

      expect(removed.mediaPaths).toEqual([`${job.id}.opus`]);
    });

    it('пути схлопываются, когда извлечения не было', async () => {
      // Загруженный mp3 и есть дорожка: удалять по одному пути дважды
      // нечего.
      await grant(AccessLevel.Write);
      const job = await createJob({ uploadType: 'audio/mpeg' });
      const uploadPath = (await rowOf(job.id))?.uploadPath;
      await testDb.db
        .update(transcriptionJobs)
        .set({ audioPath: uploadPath, audioBytes: 10, audioType: 'audio/mpeg' })
        .where(eq(transcriptionJobs.id, job.id));

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(writer(), tx, projectId, job.id),
      );

      expect(removed.mediaPaths).toHaveLength(1);
    });

    it('задача чужого проекта не удаляется и не раскрывается', async () => {
      await grant(AccessLevel.Write);
      await grant(AccessLevel.Write, otherProjectId);
      const job = await createJob();

      await expect(
        testDb.db.transaction((tx) => repository.remove(writer(), tx, otherProjectId, job.id)),
      ).rejects.toThrow(SectionNotVisibleError);
    });

    it('у удалённой записи оба пути обнуляются, а размер остаётся', async () => {
      await grant(AccessLevel.Write);
      const job = await createJob();
      await testDb.db
        .update(transcriptionJobs)
        .set({ audioPath: `${job.id}.opus`, audioBytes: 10, audioType: 'audio/ogg' })
        .where(eq(transcriptionJobs.id, job.id));

      await testDb.db.transaction((tx) => repository.forgetMedia(tx, job.id));

      const row = await rowOf(job.id);

      expect(row?.uploadPath).toBeNull();
      expect(row?.audioPath).toBeNull();
      expect(row?.uploadBytes).toBeGreaterThan(0);
    });
  });
});
