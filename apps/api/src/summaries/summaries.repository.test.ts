import {
  AccessLevel,
  ChronicleSource,
  Section,
  SubjectKind,
  SummaryTaskOrigin,
  summaryDetailSchema,
  type SummaryCreate,
} from '@cairn/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
import {
  chronicleEntries,
  grants,
  projects,
  roadmapVersions,
  subjects,
  summaries,
  summaryTaskDrafts,
  users,
} from '../db/schema';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { SummariesRepository } from './summaries.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

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

    it('обозначение версии-получателя скрыто без выдачи на роадмап', async () => {
      // Обозначение версии — данные роадмапа; «ушло в роадмап» —
      // состояние потока, и оно видно всегда.
      const summaryId = await createSummary();
      const versionId = await createVersion('v1.3');
      await testDb.db.update(summaries).set({ releasedVersionId: versionId }).where(
        eq(summaries.id, summaryId),
      );
      await grant(Section.Chronicle, AccessLevel.Write);

      const [item] = await repository.findForProject(member(), projectId);

      expect(item?.isReleased).toBe(true);
      expect(item?.releasedVersionLabel).toBeNull();
    });

    it('на уровне метаданных роадмапа обозначение видно', async () => {
      const summaryId = await createSummary();
      const versionId = await createVersion('v1.3');
      await testDb.db.update(summaries).set({ releasedVersionId: versionId }).where(
        eq(summaries.id, summaryId),
      );
      await grant(Section.Chronicle, AccessLevel.Write);
      await grant(Section.Roadmap, AccessLevel.Metadata);

      const [item] = await repository.findForProject(member(), projectId);

      expect(item?.releasedVersionLabel).toBe('v1.3');
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

    it('уровня чтения хроники для удаления не хватает', async () => {
      const summaryId = await createSummary();
      await grant(Section.Chronicle, AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) => repository.remove(member(), tx, projectId, summaryId)),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });
  });
});
