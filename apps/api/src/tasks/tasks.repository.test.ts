import {
  AccessLevel,
  PlatformKind,
  Section,
  SubjectKind,
  TaskOrigin,
} from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import {
  grants,
  projectPlatforms,
  projectTaskPlatforms,
  projectTasks,
  projects,
  roadmapCheckpoints,
  roadmapVersions,
  subjects,
  users,
} from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { TaskPlacedError } from './tasks.errors';
import { TasksRepository } from './tasks.repository';

describe('репозиторий задач проекта', () => {
  let testDb: TestDatabase;
  let repository: TasksRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new TasksRepository(testDb.db, new AccessService(testDb.db));
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

  /**
   * Выдача именно на «Роадмап»: задача отвечает на вопрос «что делаем».
   *
   * Новой единицы выдачи у задач нет, секций по-прежнему шесть, и этот
   * тест — сторож решения: выдача на «Инфо» списка не открывает.
   */
  async function grant(level: AccessLevel, section: Section = Section.Roadmap): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section,
      level,
      grantedBy: adminUserId,
    });
  }

  /** Задача прямо в базе: тесты чтения не зависят от ручки записи. */
  async function seedTask(
    title: string,
    project = projectId,
    origin = TaskOrigin.Manual,
  ): Promise<string> {
    const [task] = await testDb.db
      .insert(projectTasks)
      .values({ projectId: project, title, origin })
      .returning();

    return task!.id;
  }

  /** Версия с размещением задачи в ней. */
  async function placeTask(taskId: string, label: string, position = 1): Promise<string> {
    const [version] = await testDb.db
      .insert(roadmapVersions)
      .values({ projectId, label, position })
      .returning();

    await testDb.db
      .insert(roadmapCheckpoints)
      .values({ versionId: version!.id, taskId, position: 1 });

    return version!.id;
  }

  describe('чтение', () => {
    it('без выдачи не раскрывает даже существования задач', async () => {
      await seedTask('Поднять предел текста');

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('выдача на «Инфо» списка задач не открывает', async () => {
      // Сторож решения о правах: задача принадлежит «Роадмапу», и своей
      // единицы выдачи у неё нет.
      await grant(AccessLevel.Read, Section.Info);
      await seedTask('Поднять предел текста');

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('уровень метаданных списка не даёт, и отказ — 403, а не 404', async () => {
      // Формулировка — содержимое, а не метаданные: уровень «метаданные»
      // существует ради переменных, и выдавать по нему текст задач
      // значило бы отдать содержимое тому, кому дали только список.
      //
      // Отказ именно `403`: субъект роадмап **видит**, и отрицать
      // существование того, что он только что видел, бессмысленно — в
      // отличие от выдачи, которой нет вовсе (она `404`).
      await grant(AccessLevel.Metadata);
      await seedTask('Поднять предел текста');

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        InsufficientLevelError,
      );
    });

    it('чужие задачи в список не попадают', async () => {
      await grant(AccessLevel.Read);
      await seedTask('Своя');
      await seedTask('Чужая', otherProjectId);

      const tasks = await repository.findForProject(member(), projectId);

      expect(tasks.map((task) => task.title)).toEqual(['Своя']);
    });

    it('задача вне версии отдаётся с пустым размещением', async () => {
      await grant(AccessLevel.Read);
      await seedTask('Поднять предел текста');

      const [task] = await repository.findForProject(member(), projectId);

      expect(task?.placement).toBeNull();
    });

    it('размещённая задача называет версию, позицию и признак', async () => {
      await grant(AccessLevel.Read);
      const taskId = await seedTask('Оплата');
      await placeTask(taskId, 'v1.2');

      const [task] = await repository.findForProject(member(), projectId);

      expect(task?.placement).toMatchObject({
        versionLabel: 'v1.2',
        isDone: false,
        position: 1,
        carriedFromVersionId: null,
      });
    });

    it('задачи вне версий идут сверху, остальные — по позиции версии', async () => {
      // Вне версии — то, о чём ещё не решили, и ради чего на этот экран и
      // приходят. Порядок задан, а не случаен: иначе список тасовался бы
      // между запросами.
      await grant(AccessLevel.Read);
      const second = await seedTask('В версии v2');
      const first = await seedTask('В версии v1');
      await seedTask('Вне версии');
      await placeTask(second, 'v2', 2);
      await placeTask(first, 'v1', 1);

      const tasks = await repository.findForProject(member(), projectId);

      expect(tasks.map((task) => task.title)).toEqual(['Вне версии', 'В версии v1', 'В версии v2']);
    });

    it('фильтр отдаёт только задачи вне версий', async () => {
      await grant(AccessLevel.Read);
      const placed = await seedTask('В версии');
      await seedTask('Вне версии');
      await placeTask(placed, 'v1');

      const tasks = await repository.findForProject(member(), projectId, { loose: true });

      expect(tasks.map((task) => task.title)).toEqual(['Вне версии']);
    });
  });

  describe('запись', () => {
    it('заводит задачу вне версии и помнит путь появления', async () => {
      await grant(AccessLevel.Write);

      const created = await testDb.db.transaction((tx) =>
        repository.create(member(), tx, projectId, { title: 'Поднять предел текста' }),
      );

      expect(created).toMatchObject({ title: 'Поднять предел текста', origin: TaskOrigin.Manual });
      expect((await repository.findForProject(member(), projectId))[0]?.placement).toBeNull();
    });

    it('уровень чтения заводить не даёт', async () => {
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) => repository.create(member(), tx, projectId, { title: 'Раз' })),
      ).rejects.toThrow();
    });

    it('правит формулировку и ссылку', async () => {
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Было');

      await testDb.db.transaction((tx) =>
        repository.update(member(), tx, projectId, taskId, {
          title: 'Стало',
          url: 'https://tracker.example/7',
        }),
      );

      expect((await repository.findForProject(member(), projectId))[0]).toMatchObject({
        title: 'Стало',
        url: 'https://tracker.example/7',
      });
    });

    it('правка без тегов их не трогает, пустой набор снимает', async () => {
      // Та же идиома, что у черновика саммари: правка одного поля не
      // должна сносить другое.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      const [platform] = await testDb.db
        .insert(projectPlatforms)
        .values({ projectId, kind: PlatformKind.Server, name: 'API', position: 1 })
        .returning();

      await testDb.db.transaction((tx) =>
        repository.update(member(), tx, projectId, taskId, { platformIds: [platform!.id] }),
      );
      await testDb.db.transaction((tx) =>
        repository.update(member(), tx, projectId, taskId, { title: 'Оплата картой' }),
      );

      expect((await repository.findForProject(member(), projectId))[0]).toMatchObject({
        title: 'Оплата картой',
        platformIds: [platform!.id],
      });

      await testDb.db.transaction((tx) =>
        repository.update(member(), tx, projectId, taskId, { platformIds: [] }),
      );

      expect(await testDb.rowsOf(projectTaskPlatforms)).toHaveLength(0);
    });

    it('не ставит тег платформы чужого проекта', async () => {
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      const [foreign] = await testDb.db
        .insert(projectPlatforms)
        .values({ projectId: otherProjectId, kind: PlatformKind.Server, name: 'API', position: 1 })
        .returning();

      await expect(
        testDb.db.transaction((tx) =>
          repository.update(member(), tx, projectId, taskId, { platformIds: [foreign!.id] }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('чужую задачу не правит и её существования не раскрывает', async () => {
      await grant(AccessLevel.Write);
      const foreign = await seedTask('Чужая', otherProjectId);

      await expect(
        testDb.db.transaction((tx) =>
          repository.update(member(), tx, projectId, foreign, { title: 'Моя' }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('удаляет задачу вне версии вместе с её тегами', async () => {
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      const [platform] = await testDb.db
        .insert(projectPlatforms)
        .values({ projectId, kind: PlatformKind.Server, name: 'API', position: 1 })
        .returning();
      await testDb.db.insert(projectTaskPlatforms).values({ taskId, platformId: platform!.id });

      await testDb.db.transaction((tx) => repository.remove(member(), tx, projectId, taskId));

      expect(await testDb.rowsOf(projectTasks)).toHaveLength(0);
      expect(await testDb.rowsOf(projectTaskPlatforms)).toHaveLength(0);
    });

    it('размещённую задачу удалить отказывается', async () => {
      // Каскад менял бы прогресс версии с другого экрана и молча.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await placeTask(taskId, 'v1.2');

      await expect(
        testDb.db.transaction((tx) => repository.remove(member(), tx, projectId, taskId)),
      ).rejects.toBeInstanceOf(TaskPlacedError);

      expect(await testDb.rowsOf(projectTasks)).toHaveLength(1);
    });

    it('вынимает задачу из версии, оставляя её в реестре', async () => {
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await placeTask(taskId, 'v1.2');

      await testDb.db.transaction((tx) => repository.detach(member(), tx, projectId, taskId));

      expect(await testDb.rowsOf(roadmapCheckpoints)).toHaveLength(0);
      expect((await repository.findForProject(admin(), projectId))[0]).toMatchObject({
        title: 'Оплата',
        placement: null,
      });
    });
  });
});
