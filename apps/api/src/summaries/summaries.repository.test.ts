import {
  AccessLevel,
  ChronicleSource,
  PlatformKind,
  Section,
  SubjectKind,
  SummaryTaskOrigin,
  TranscriberKind,
  TranscriptionState,
  summaryDetailSchema,
  type SummaryCreate,
} from '@cairn/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
import {
  chronicleEntries,
  grants,
  projectPlatforms,
  projects,
  roadmapVersions,
  subjects,
  summaries,
  summaryTaskDrafts,
  summaryTaskPlatforms,
  transcriptionJobs,
  users,
} from '../db/schema';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { SummariesRepository } from './summaries.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

/** Отметка разбивки: шаг релиза её не читает, а тестам нужна одна и та же. */
const STAMP = {
  name: 'external',
  model: 'gpt-4o-mini',
  textUpdatedAt: new Date('2026-11-16T10:00:00.000Z'),
  dropped: 0,
};

/** Входные данные создания: точечные проверки меняют в них одно поле. */
const CREATE_INPUT: SummaryCreate = {
  occurredOn: '2026-11-16',
  title: 'Созвон по релизу',
  text: 'обсудили сроки',
};

describe('репозиторий саммари', () => {
  let testDb: TestDatabase;
  let repository: SummariesRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const access = new AccessService(testDb.db);
    repository = new SummariesRepository(
      testDb.db,
      access,
      new ChronicleRepository(testDb.db, access),
      new RoadmapRepository(testDb.db, access),
    );
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

  async function grant(section: Section, level: AccessLevel): Promise<void> {
    await testDb.db
      .insert(grants)
      .values({ subjectId, projectId, section, level, grantedBy: adminUserId });
  }

  /** Саммари от лица суперадмина: подготовка данных, а не проверка прав. */
  async function createSummary(input: SummaryCreate = CREATE_INPUT): Promise<string> {
    const created = await testDb.db.transaction((tx) =>
      repository.create(admin(), tx, projectId, input),
    );

    return created.id;
  }

  /**
   * Расшифровка над саммари вставкой: репозиторий расшифровок потребовал бы
   * своих выдач, а здесь это подготовка данных.
   */
  async function addJob(
    summaryId: string,
    overrides: Partial<typeof transcriptionJobs.$inferInsert> = {},
  ): Promise<string> {
    const id = crypto.randomUUID();
    const [created] = await testDb.db
      .insert(transcriptionJobs)
      .values({
        id,
        projectId,
        summaryId,
        requestedBySubjectId: adminSubjectId,
        state: TranscriptionState.Done,
        transcriber: TranscriberKind.External,
        model: 'general',
        uploadPath: `${id}.mp4`,
        uploadBytes: 566_231_040,
        uploadType: 'video/mp4',
        audioPath: `${id}.opus`,
        audioBytes: 11_534_336,
        audioType: 'audio/ogg',
        ...overrides,
      })
      .returning();

    return created!.id;
  }

  /** Версия роадмапа вставкой: `createVersion` потребовал бы своих выдач. */
  async function createVersion(label: string, position = 1): Promise<string> {
    const [created] = await testDb.db
      .insert(roadmapVersions)
      .values({ projectId, label, position })
      .returning();

    return created!.id;
  }

  /** Отметка «разбивка построена по тексту на этот момент». */
  async function markSuggested(summaryId: string, at: Date): Promise<void> {
    await testDb.db
      .update(summaries)
      .set({
        suggesterName: 'external',
        suggesterModel: 'gpt-4o-mini',
        suggestedAt: at,
        suggestedTextAt: at,
      })
      .where(eq(summaries.id, summaryId));
  }

  /** Правка записи хроники задним числом: `updated_at` двигает любая правка. */
  async function editEntryAt(entryId: string, at: Date): Promise<void> {
    await testDb.db
      .update(chronicleEntries)
      .set({ content: 'текст поправили', updatedAt: at })
      .where(eq(chronicleEntries.id, entryId));
  }

  /**
   * Платформа вставкой: репозиторий платформ потребовал бы «Инфо»,
   * которого у субъекта этого потока может не быть вовсе.
   */
  async function createPlatform(
    name: string,
    kind = PlatformKind.Server,
    position = 1,
    target = projectId,
  ): Promise<string> {
    const [created] = await testDb.db
      .insert(projectPlatforms)
      .values({ projectId: target, name, kind, position })
      .returning();

    return created!.id;
  }

  /** Строка черновика вставкой: её происхождение задаёт сам тест. */
  async function addTask(
    summaryId: string,
    title: string,
    origin = SummaryTaskOrigin.Model,
    position = 1,
  ): Promise<string> {
    const [created] = await testDb.db
      .insert(summaryTaskDrafts)
      .values({ summaryId, title, position, origin })
      .returning();

    return created!.id;
  }

  describe('создание', () => {
    it('создаёт запись хроники и саммари одной транзакцией', async () => {
      const summary = await testDb.db.transaction((tx) =>
        repository.create(admin(), tx, projectId, CREATE_INPUT),
      );

      const [entry] = await testDb.rowsOf(chronicleEntries);

      expect(entry?.source).toBe(ChronicleSource.Summary);
      expect(summary.chronicleEntryId).toBe(entry?.id);
      expect(summary.text).toBe('обсудили сроки');
    });

    it('деталь соответствует схеме контракта', async () => {
      // Контракт — единственный источник формы ответа: разойдясь с ним,
      // репозиторий сломал бы веб, а не свои тесты.
      const summary = await testDb.db.transaction((tx) =>
        repository.create(admin(), tx, projectId, CREATE_INPUT),
      );

      expect(() => summaryDetailSchema.parse(summary)).not.toThrow();
      expect(summary).toMatchObject({ projectName: 'Проект', taskCount: 0, isReleased: false });
    });

    it('уровня чтения хроники не хватает', async () => {
      // Первое, что делает поток, — сохраняет текст.
      await grant(Section.Chronicle, AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) => repository.create(member(), tx, projectId, CREATE_INPUT)),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('без выдачи на хронику проект не раскрывается', async () => {
      await expect(
        testDb.db.transaction((tx) => repository.create(member(), tx, projectId, CREATE_INPUT)),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });

  describe('чтение', () => {
    it('саммари чужого проекта выглядит несуществующим', async () => {
      // Выборка по (id, project_id), как requireEntry в хронике.
      const summaryId = await createSummary();

      await expect(
        repository.findById(admin(), otherProjectId, summaryId),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('список проекта отдаёт свежие сверху', async () => {
      await createSummary({ ...CREATE_INPUT, title: 'первое' });
      await createSummary({ ...CREATE_INPUT, title: 'второе' });

      const items = await repository.findForProject(admin(), projectId);

      expect(items.map((item) => item.title)).toEqual(['второе', 'первое']);
    });

    it('считает задачи черновика', async () => {
      const summaryId = await createSummary();
      await addTask(summaryId, 'раз', SummaryTaskOrigin.Model, 1);
      await addTask(summaryId, 'два', SummaryTaskOrigin.Human, 2);

      const [item] = await repository.findForProject(admin(), projectId);

      expect(item?.taskCount).toBe(2);
    });

    it('без выдачи на хронику список не отдаётся', async () => {
      await createSummary();

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('версия-получатель скрыта без выдачи на роадмап целиком', async () => {
      // И обозначение, и идентификатор — данные роадмапа: ссылка на
      // версию, которой субъект не видит, вела бы в закрытую секцию.
      // «Ушло в роадмап» — состояние потока, и оно видно всегда.
      const summaryId = await createSummary();
      const versionId = await createVersion('v1.3');
      await testDb.db.update(summaries).set({ releasedVersionId: versionId }).where(
        eq(summaries.id, summaryId),
      );
      await grant(Section.Chronicle, AccessLevel.Write);

      const [item] = await repository.findForProject(member(), projectId);
      const detail = await repository.findById(member(), projectId, summaryId);

      expect(item?.isReleased).toBe(true);
      expect(item?.releasedVersionLabel).toBeNull();
      expect(item?.releasedVersionId).toBeNull();
      expect(detail.isReleased).toBe(true);
      expect(detail.releasedVersionId).toBeNull();
    });

    it('на уровне метаданных роадмапа видны и обозначение, и версия', async () => {
      // Идентификатор нужен списку: ссылка «Ушло в v1.3» ведёт на
      // роадмап с открытой версией (`?version=`), а не на полосу целиком.
      const summaryId = await createSummary();
      const versionId = await createVersion('v1.3');
      await testDb.db.update(summaries).set({ releasedVersionId: versionId }).where(
        eq(summaries.id, summaryId),
      );
      await grant(Section.Chronicle, AccessLevel.Write);
      await grant(Section.Roadmap, AccessLevel.Metadata);

      const [item] = await repository.findForProject(member(), projectId);

      expect(item?.releasedVersionLabel).toBe('v1.3');
      expect(item?.releasedVersionId).toBe(versionId);
    });

    it('подсказка обозначения пуста без выдачи на роадмап', async () => {
      // Уровень спрашивается, а не ловится исключением: try/catch вокруг
      // requireLevel спрятал бы и настоящие ошибки.
      const summaryId = await createSummary();
      await createVersion('v1.2');
      await grant(Section.Chronicle, AccessLevel.Write);

      const detail = await repository.findById(member(), projectId, summaryId);

      expect(detail.suggestedVersionLabel).toBeNull();
    });

    it('на уровне метаданных роадмапа подсказка считается', async () => {
      const summaryId = await createSummary();
      await createVersion('v1.2');
      await grant(Section.Chronicle, AccessLevel.Write);
      await grant(Section.Roadmap, AccessLevel.Metadata);

      const detail = await repository.findById(member(), projectId, summaryId);

      expect(detail.suggestedVersionLabel).toBe('v1.3');
    });

    it('текст, поправленный после разбивки, помечен устаревшим', async () => {
      const summaryId = await createSummary();
      const [entry] = await testDb.rowsOf(chronicleEntries);
      await markSuggested(summaryId, new Date('2026-11-16T10:00:00Z'));
      await editEntryAt(entry!.id, new Date('2026-11-16T12:00:00Z'));

      const detail = await repository.findById(admin(), projectId, summaryId);

      expect(detail.isTextStale).toBe(true);
      expect(detail.suggester).toMatchObject({ name: 'external', model: 'gpt-4o-mini' });
    });

    it('у прежней отметки число отброшенных неизвестно, а не равно нулю', async () => {
      const summaryId = await createSummary();
      await markSuggested(summaryId, new Date());
      const detail = await repository.findById(admin(), projectId, summaryId);
      expect(detail.suggester?.dropped).toBeNull();
    });

    it('до разбивки текст устаревшим не считается', async () => {
      // `suggested_text_at` пуст: сравнивать не с чем, и предупреждать
      // не о чем.
      const summaryId = await createSummary();

      const detail = await repository.findById(admin(), projectId, summaryId);

      expect(detail.isTextStale).toBe(false);
      expect(detail.suggester).toBeNull();
    });

    it('задачи отдаются по позициям вместе с происхождением', async () => {
      const summaryId = await createSummary();
      await addTask(summaryId, 'второе', SummaryTaskOrigin.Human, 2);
      await addTask(summaryId, 'первое', SummaryTaskOrigin.Model, 1);

      const detail = await repository.findById(admin(), projectId, summaryId);

      expect(detail.tasks.map((task) => task.title)).toEqual(['первое', 'второе']);
      expect(detail.tasks[0]?.origin).toBe(SummaryTaskOrigin.Model);
    });
  });

  describe('замена черновика', () => {
    it('нумерует позиции по порядку массива', async () => {
      // Позиции не принимаются от клиента: второе место для порядка
      // разошлось бы с первым.
      const summaryId = await createSummary();

      const detail = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ title: 'раз' }, { title: 'два' }, { title: 'три' }],
        }),
      );

      expect(detail.tasks.map((task) => task.position)).toEqual([1, 2, 3]);
      expect(detail.tasks.map((task) => task.title)).toEqual(['раз', 'два', 'три']);
    });

    it('строка с id сохраняет происхождение', async () => {
      // Иначе «предложено моделью» снималось бы первым же сохранением.
      const summaryId = await createSummary();
      const modelTaskId = await addTask(summaryId, 'предложено моделью');

      const detail = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ id: modelTaskId, title: 'правленная формулировка' }],
        }),
      );

      expect(detail.tasks[0]?.origin).toBe(SummaryTaskOrigin.Model);
      expect(detail.tasks[0]?.title).toBe('правленная формулировка');
    });

    it('строка без id набрана человеком', async () => {
      const summaryId = await createSummary();

      const detail = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ title: 'дописал руками' }],
        }),
      );

      expect(detail.tasks[0]?.origin).toBe(SummaryTaskOrigin.Human);
    });

    it('исчезнувшая из массива строка удаляется', async () => {
      const summaryId = await createSummary();
      await addTask(summaryId, 'раз');

      await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, { tasks: [] }),
      );

      expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
    });

    it('чужой id в массиве не подхватывает чужую строку', async () => {
      // Иначе правка черновика стала бы способом увести строку из другого
      // саммари.
      const summaryId = await createSummary();
      const foreignSummaryId = await createSummary({ ...CREATE_INPUT, title: 'другое' });
      const foreignTaskId = await addTask(foreignSummaryId, 'чужая');

      await expect(
        testDb.db.transaction((tx) =>
          repository.replaceTasks(admin(), tx, projectId, summaryId, {
            tasks: [{ id: foreignTaskId, title: 'чужая' }],
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(1);
    });

    it('после сформированного релиза черновик не правится', async () => {
      // Чекпоинты уже живут в роадмапе: правка задним числом развела бы
      // две правды о том, что уехало.
      const summaryId = await createSummary();
      const versionId = await createVersion('v1.3');
      await testDb.db.update(summaries).set({ releasedVersionId: versionId }).where(
        eq(summaries.id, summaryId),
      );

      await expect(
        testDb.db.transaction((tx) =>
          repository.replaceTasks(admin(), tx, projectId, summaryId, {
            tasks: [{ title: 'поздно' }],
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('уровня чтения хроники для правки не хватает', async () => {
      const summaryId = await createSummary();
      await grant(Section.Chronicle, AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.replaceTasks(member(), tx, projectId, summaryId, { tasks: [] }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });
  });

  describe('удаление', () => {
    it('удаление уносит черновик перед саммари', async () => {
      const summaryId = await createSummary();
      await addTask(summaryId, 'раз');

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, summaryId));

      expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
      expect(await testDb.rowsOf(summaries)).toHaveLength(0);
    });

    it('удаление саммари запись хроники не трогает', async () => {
      // Запись — артефакт проекта, её удаление — действие секции «Хроника».
      const summaryId = await createSummary();

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, summaryId));

      expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(1);
    });

    it('удаление саммари уносит его расшифровки', async () => {
      const summaryId = await createSummary();
      await addJob(summaryId);

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, summaryId));

      expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
      expect(await testDb.rowsOf(summaries)).toHaveLength(0);
    });

    it('удаление саммари отдаёт пути записей вызывающему', async () => {
      // Файлы удаляются после фиксации: удаление файла не откатывается, и
      // обратный порядок унёс бы запись у саммари, удаление которого потом
      // откатилось.
      const summaryId = await createSummary();
      const jobId = await addJob(summaryId);

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, summaryId),
      );

      expect(removed.mediaPaths).toEqual([`${jobId}.mp4`, `${jobId}.opus`]);
    });

    it('несколько попыток по одним файлам дают два пути, а не четыре', async () => {
      // Повторная расшифровка не копирует запись: пути у попыток
      // одинаковы, и удалять дважды нечего.
      const summaryId = await createSummary();
      const jobId = await addJob(summaryId);
      await addJob(summaryId, { uploadPath: `${jobId}.mp4`, audioPath: `${jobId}.opus` });

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, summaryId),
      );

      expect(removed.mediaPaths).toHaveLength(2);
    });

    it('без извлечения путь один: загруженное и есть дорожка', async () => {
      const summaryId = await createSummary();
      const jobId = await addJob(summaryId, { uploadType: 'audio/mpeg' });
      await testDb.db
        .update(transcriptionJobs)
        .set({ uploadPath: `${jobId}.mp3`, audioPath: `${jobId}.mp3` })
        .where(eq(transcriptionJobs.id, jobId));

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, summaryId),
      );

      expect(removed.mediaPaths).toEqual([`${jobId}.mp3`]);
    });

    it('у саммари с уложенным текстом путь один: исходник уже убран', async () => {
      // Обычный случай, а не краевой: исходник уносится при переходе в
      // done (решение владельца 2), и у живого саммари остаётся дорожка.
      const summaryId = await createSummary();
      const jobId = await addJob(summaryId, { uploadPath: null });

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, summaryId),
      );

      expect(removed.mediaPaths).toEqual([`${jobId}.opus`]);
    });

    it('уровня чтения хроники для удаления не хватает', async () => {
      const summaryId = await createSummary();
      await grant(Section.Chronicle, AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) => repository.remove(member(), tx, projectId, summaryId)),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });
  });

  describe('ссылка и теги в черновике', () => {
    let apiPlatformId: string;

    beforeEach(async () => {
      apiPlatformId = await createPlatform('API', PlatformKind.Server, 1);
    });

    it('сохраняются вместе со строкой', async () => {
      const summaryId = await createSummary();

      const detail = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [
            { title: 'Сделать', url: 'https://tracker.example/1', platformIds: [apiPlatformId] },
          ],
        }),
      );

      expect(detail.tasks[0]?.url).toBe('https://tracker.example/1');
      expect(detail.tasks[0]?.platformIds).toEqual([apiPlatformId]);
    });

    it('отсутствие полей оставляет прежние значения', async () => {
      // Редактор субъекта без выдачи на роадмап чипов не видит и набор не
      // отправляет: его правка формулировки не вправе стереть чужую
      // работу (дизайн, 3.3).
      const summaryId = await createSummary();
      const saved = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [
            { title: 'Сделать', url: 'https://tracker.example/1', platformIds: [apiPlatformId] },
          ],
        }),
      );

      const again = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ id: saved.tasks[0]!.id, title: 'Сделать иначе' }],
        }),
      );

      expect(again.tasks[0]?.title).toBe('Сделать иначе');
      expect(again.tasks[0]?.url).toBe('https://tracker.example/1');
      expect(again.tasks[0]?.platformIds).toEqual([apiPlatformId]);
    });

    it('снимаются явно', async () => {
      const summaryId = await createSummary();
      const saved = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [
            { title: 'Сделать', url: 'https://tracker.example/1', platformIds: [apiPlatformId] },
          ],
        }),
      );

      const cleared = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ id: saved.tasks[0]!.id, title: 'Сделать', url: null, platformIds: [] }],
        }),
      );

      expect(cleared.tasks[0]?.url).toBeNull();
      expect(cleared.tasks[0]?.platformIds).toEqual([]);
    });

    it('у новой строки без id сохранять нечего: поля пусты', async () => {
      const summaryId = await createSummary();

      const detail = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ title: 'Набрал руками' }],
        }),
      );

      expect(detail.tasks[0]?.url).toBeNull();
      expect(detail.tasks[0]?.platformIds).toEqual([]);
    });

    it('теги переносятся на нужную строку при перестановке', async () => {
      // Строки черновика удаляются и вставляются заново на каждом
      // сохранении: сопоставление идёт по `position`, а не по порядку
      // `RETURNING`, который стандарт не обещает.
      const summaryId = await createSummary();
      const saved = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [
            { title: 'Первая', platformIds: [apiPlatformId] },
            { title: 'Вторая', platformIds: [] },
          ],
        }),
      );

      const swapped = await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [
            { id: saved.tasks[1]!.id, title: 'Вторая' },
            { id: saved.tasks[0]!.id, title: 'Первая' },
          ],
        }),
      );

      expect(swapped.tasks.map((task) => [task.title, task.platformIds])).toEqual([
        ['Вторая', []],
        ['Первая', [apiPlatformId]],
      ]);
    });

    it('разбивка моделью приходит без ссылки и без тегов', async () => {
      // Инвариант порта: из вывода модели берётся только формулировка.
      const summaryId = await createSummary();

      const detail = await testDb.db.transaction((tx) =>
        repository.replaceWithSuggested(admin(), tx, projectId, summaryId, ['Задача'], STAMP),
      );

      expect(detail.tasks[0]?.url).toBeNull();
      expect(detail.tasks[0]?.platformIds).toEqual([]);
    });

    it('новая разбивка уносит теги прежних строк', async () => {
      const summaryId = await createSummary();
      await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ title: 'Прежняя', platformIds: [apiPlatformId] }],
        }),
      );

      await testDb.db.transaction((tx) =>
        repository.replaceWithSuggested(admin(), tx, projectId, summaryId, ['Новая'], STAMP),
      );

      expect(await testDb.rowsOf(summaryTaskPlatforms)).toHaveLength(0);
    });

    it('пустая разбивка прежних тегов не трогает', async () => {
      // Пустая замена прежних строк не трогает вовсе — значит и тегов.
      const summaryId = await createSummary();
      await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ title: 'Прежняя', platformIds: [apiPlatformId] }],
        }),
      );

      await testDb.db.transaction((tx) =>
        repository.replaceWithSuggested(admin(), tx, projectId, summaryId, [], STAMP),
      );

      expect(await testDb.rowsOf(summaryTaskPlatforms)).toHaveLength(1);
    });

    it('удаление саммари уносит теги перед строками', async () => {
      const summaryId = await createSummary();
      await testDb.db.transaction((tx) =>
        repository.replaceTasks(admin(), tx, projectId, summaryId, {
          tasks: [{ title: 'Сделать', platformIds: [apiPlatformId] }],
        }),
      );

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, summaryId));

      expect(await testDb.rowsOf(summaryTaskPlatforms)).toHaveLength(0);
      expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
    });
  });

  describe('платформы в детали саммари', () => {
    let apiPlatformId: string;

    beforeEach(async () => {
      apiPlatformId = await createPlatform('API', PlatformKind.Server, 1);
      await createPlatform('iOS', PlatformKind.Store, 2);
    });

    it('отдаются при уровне метаданных роадмапа', async () => {
      const summaryId = await createSummary();
      await grant(Section.Chronicle, AccessLevel.Write);
      await grant(Section.Roadmap, AccessLevel.Metadata);

      const detail = await repository.findById(member(), projectId, summaryId);

      expect(detail.platforms.map((platform) => platform.name)).toEqual(['API', 'iOS']);
      expect(detail.platforms[0]?.id).toBe(apiPlatformId);
    });

    it('без выдачи на роадмап список пуст', async () => {
      // Неотличимо от проекта без платформ — это и есть нераскрытие
      // (дизайн, 3.2). Уровень спрашивается, а не ловится исключением.
      const summaryId = await createSummary();
      await grant(Section.Chronicle, AccessLevel.Write);

      const detail = await repository.findById(member(), projectId, summaryId);

      expect(detail.platforms).toEqual([]);
    });

    it('выдача на «Инфо» на список не влияет', async () => {
      // Субъект с роадмапом и без «Инфо» — штатный случай подрядчика.
      const summaryId = await createSummary();
      await grant(Section.Chronicle, AccessLevel.Write);
      await grant(Section.Roadmap, AccessLevel.Write);

      const info = await testDb.db
        .select()
        .from(grants)
        .where(and(eq(grants.subjectId, subjectId), eq(grants.section, Section.Info)));

      expect(info).toEqual([]);
      expect(await repository.findById(member(), projectId, summaryId)).toMatchObject({
        platforms: expect.arrayContaining([expect.objectContaining({ name: 'iOS' })]),
      });
    });

    it('у проекта без платформ список пуст', async () => {
      await testDb.db.delete(projectPlatforms);
      const summaryId = await createSummary();

      expect((await repository.findById(admin(), projectId, summaryId)).platforms).toEqual([]);
    });
  });
});
