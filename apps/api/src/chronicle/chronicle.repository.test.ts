import {
  AccessLevel,
  ChronicleSource,
  PlatformKind,
  Section,
  SubjectKind,
  SummaryTaskOrigin,
  TranscriberKind,
  TranscriptionState,
} from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import {
  chronicleEntries,
  grants,
  projectPlatforms,
  projects,
  subjects,
  summaries,
  summaryTaskDrafts,
  summaryTaskPlatforms,
  transcriptionJobs,
  users,
} from '../db/schema';
import { ChronicleRepository } from './chronicle.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий хроники', () => {
  let testDb: TestDatabase;
  let repository: ChronicleRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new ChronicleRepository(testDb.db, new AccessService(testDb.db));
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

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
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

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Chronicle,
      level,
      grantedBy: adminUserId,
    });
  }

  async function createEntry(occurredOn = '2026-08-27', title = 'Встреча'): Promise<string> {
    const created = await testDb.db.transaction((tx) =>
      repository.create(admin(), tx, projectId, {
        occurredOn,
        title,
        content: 'Содержимое записи',
      }),
    );

    return created.id;
  }

  describe('создание', () => {
    it('создаёт запись с автором и источником по умолчанию', async () => {
      const id = await createEntry();

      const [row] = await testDb.db
        .select()
        .from(chronicleEntries)
        .where(eq(chronicleEntries.id, id));

      expect(row?.createdBySubjectId).toBe(adminSubjectId);
      expect(row?.source).toBe(ChronicleSource.Manual);
    });

    it('сохраняет источник webhook', async () => {
      const created = await testDb.db.transaction((tx) =>
        repository.create(
          admin(),
          tx,
          projectId,
          { occurredOn: '2026-08-27', title: 'Входящее', content: 'Текст' },
          ChronicleSource.Webhook,
        ),
      );

      expect(created.source).toBe(ChronicleSource.Webhook);
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.create(member(), tx, projectId, {
            occurredOn: '2026-08-27',
            title: 'З',
            content: 'С',
          }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('скрывает существование проекта от субъекта без выдачи', async () => {
      await expect(
        testDb.db.transaction((tx) =>
          repository.create(member(), tx, projectId, {
            occurredOn: '2026-08-27',
            title: 'З',
            content: 'С',
          }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });

  describe('чтение', () => {
    it('на уровне метаданных не отдаёт содержимого', async () => {
      await createEntry();
      await grant(AccessLevel.Metadata);

      const [entry] = await repository.findForProject(member(), projectId);

      expect(entry).toMatchObject({ title: 'Встреча', occurredOn: '2026-08-27' });
      expect('content' in entry!).toBe(false);
    });

    it('на уровне чтения отдаёт содержимое', async () => {
      await createEntry();
      await grant(AccessLevel.Read);

      const [entry] = await repository.findForProject(member(), projectId);

      expect(entry).toMatchObject({ content: 'Содержимое записи' });
    });

    it('скрывает секцию от субъекта без выдачи', async () => {
      await createEntry();

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('выдача на другую секцию хронику не открывает', async () => {
      await createEntry();
      await testDb.db.insert(grants).values({
        subjectId,
        projectId,
        section: Section.Info,
        level: AccessLevel.Write,
        grantedBy: adminUserId,
      });

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('показывает свежие события первыми', async () => {
      await createEntry('2026-08-01', 'Старое');
      await createEntry('2026-08-27', 'Новое');

      const list = await repository.findForProject(admin(), projectId);

      expect(list.map((entry) => entry.title)).toEqual(['Новое', 'Старое']);
    });

    it('не отдаёт запись через чужой проект', async () => {
      const id = await createEntry();

      await expect(repository.findById(admin(), otherProjectId, id)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });
  });

  describe('правка', () => {
    it('меняет переданные поля и обновляет отметку времени', async () => {
      const id = await createEntry();

      const updated = await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { title: 'Новый заголовок' }),
      );

      expect(updated.title).toBe('Новый заголовок');
      expect(updated.content).toBe('Содержимое записи');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(updated.createdAt.getTime());
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      const id = await createEntry();
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.update(member(), tx, projectId, id, { title: 'Новый' }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });
  });

  /** Запись с саммари и расшифровкой над ним: два файла на томе. */
  async function entryWithTranscription(): Promise<{ entryId: string; jobId: string }> {
    const entryId = await createEntry();
    const [summary] = await testDb.db
      .insert(summaries)
      .values({ projectId, chronicleEntryId: entryId, createdBySubjectId: adminSubjectId })
      .returning();
    const jobId = crypto.randomUUID();
    await testDb.db.insert(transcriptionJobs).values({
      id: jobId,
      projectId,
      summaryId: summary!.id,
      requestedBySubjectId: adminSubjectId,
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

    return { entryId, jobId };
  }

  describe('удаление', () => {
    it('удаляет запись и возвращает её', async () => {
      const id = await createEntry();

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, id),
      );

      expect(removed.title).toBe('Встреча');
      expect(await testDb.db.select().from(chronicleEntries)).toHaveLength(0);
    });

    it('удаление записи уносит саммари с его черновиком', async () => {
      // Каскадов в проекте нет, ссылка restrict: не унесём — удаление
      // упадёт на внешнем ключе, и запись станет неудаляемой.
      const id = await createEntry();
      const [summary] = await testDb.db
        .insert(summaries)
        .values({ projectId, chronicleEntryId: id, createdBySubjectId: adminSubjectId })
        .returning();
      await testDb.db.insert(summaryTaskDrafts).values({
        summaryId: summary!.id,
        title: 'Сделать',
        position: 1,
        origin: SummaryTaskOrigin.Model,
      });

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
      expect(await testDb.rowsOf(summaries)).toHaveLength(0);
      expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(0);
    });

    it('удаление записи уносит теги черновика перед его строками', async () => {
      // На ссылках `restrict`: без уборки запись с размеченным черновиком
      // стала бы неудаляемой — ровно та же дырка, которую уже закрывали
      // для самого черновика.
      const id = await createEntry();
      const [platform] = await testDb.db
        .insert(projectPlatforms)
        .values({ projectId, name: 'API', kind: PlatformKind.Server, position: 1 })
        .returning();
      const [summary] = await testDb.db
        .insert(summaries)
        .values({ projectId, chronicleEntryId: id, createdBySubjectId: adminSubjectId })
        .returning();
      const [draft] = await testDb.db
        .insert(summaryTaskDrafts)
        .values({
          summaryId: summary!.id,
          title: 'Сделать',
          position: 1,
          origin: SummaryTaskOrigin.Model,
        })
        .returning();
      await testDb.db
        .insert(summaryTaskPlatforms)
        .values({ draftId: draft!.id, platformId: platform!.id });

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      expect(await testDb.rowsOf(summaryTaskPlatforms)).toHaveLength(0);
      expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
      expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(0);
    });

    it('удаление записи уносит расшифровки её саммари', async () => {
      // Они дети саммари, и без них удаление упёрлось бы в целостность.
      const { entryId } = await entryWithTranscription();

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, entryId));

      expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
      expect(await testDb.rowsOf(summaries)).toHaveLength(0);
    });

    it('удаление записи отдаёт пути файлов созвонов', async () => {
      const { entryId, jobId } = await entryWithTranscription();

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, entryId),
      );

      expect(removed.mediaPaths).toEqual([`${jobId}.mp4`, `${jobId}.opus`]);
    });

    it('у записи без саммари путей файлов нет вовсе', async () => {
      // Сторож вырождения: пустой список обязан быть пустым списком, а не
      // «чем-нибудь», иначе служба звала бы unlink по выдуманному пути.
      const id = await createEntry();

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, id),
      );

      expect(removed.mediaPaths).toEqual([]);
    });

    it('удаление записи без саммари работает как раньше', async () => {
      const id = await createEntry();

      await expect(
        testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id)),
      ).resolves.toMatchObject({ id });
    });

    it('сообщает «не найдено» об уже удалённой записи', async () => {
      const id = await createEntry();
      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      await expect(
        testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id)),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });
});
