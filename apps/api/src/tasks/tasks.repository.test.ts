import {
  AccessLevel,
  PlatformKind,
  Section,
  SubjectKind,
  TaskOrigin,
  TrackerKind,
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
  taskExports,
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

  /** Выгрузка задачи прямо в базе: тесты проекции не ждут ручки выгрузки. */
  async function seedExport(
    taskId: string,
    overrides: Partial<{
      externalId: string;
      externalUrl: string | null;
      externalColumnId: string | null;
      isCompleted: boolean;
      checkedAt: Date | null;
      failureCode: string | null;
    }> = {},
  ): Promise<void> {
    await testDb.db.insert(taskExports).values({
      taskId,
      tracker: TrackerKind.Weeek,
      externalId: '4096',
      externalBoardId: '11',
      externalColumnId: '31',
      ...overrides,
    });
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

    it('невыгруженная задача отдаётся с пустым зеркалом', async () => {
      // `null`, а не пустые поля: «не выгружалась» обязано читаться одним
      // условием — экран на этом состоянии показывает кнопку «Выгрузить».
      await grant(AccessLevel.Read);
      await seedTask('Поднять предел текста');

      const [task] = await repository.findForProject(member(), projectId);

      expect(task?.export).toBeNull();
    });

    it('выгруженная задача приносит зеркало и встречается в списке один раз', async () => {
      await grant(AccessLevel.Read);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, {
        externalUrl: 'https://app.weeek.net/ws/42/project/7/task/4096',
        checkedAt: new Date('2026-11-21T10:05:00.000Z'),
      });

      const tasks = await repository.findForProject(member(), projectId);

      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.export).toMatchObject({
        tracker: TrackerKind.Weeek,
        externalId: '4096',
        externalUrl: 'https://app.weeek.net/ws/42/project/7/task/4096',
        externalBoardId: '11',
        externalColumnId: '31',
        isCompleted: false,
        checkedAt: '2026-11-21T10:05:00.000Z',
        failureCode: null,
      });
    });

    it('«ни разу не спрашивали» отдаётся пустым временем опроса', async () => {
      // `checked_at` пишется при каждом опросе, даже когда ничего не
      // изменилось, поэтому пусто означает ровно «опроса ещё не было».
      // Подставить сюда время выгрузки значило бы сказать, что статус
      // спрашивали, — та же ошибка, что аптайм без пропусков наблюдения.
      await grant(AccessLevel.Read);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);

      const [task] = await repository.findForProject(member(), projectId);

      expect(task?.export?.checkedAt).toBeNull();
      expect(task?.export?.exportedAt).not.toBeNull();
    });

    it('зеркало «закрыто там» размещения не закрывает', async () => {
      // Решение владельца (дизайн, 5): внешний статус — только зеркало.
      // Расхождение законно и показывается биркой; прогресс версии
      // считается из чекпоинтов и только из них.
      await grant(AccessLevel.Read);
      const taskId = await seedTask('Оплата');
      await placeTask(taskId, 'v1.2');
      await seedExport(taskId, { isCompleted: true });

      const [task] = await repository.findForProject(member(), projectId);

      expect(task?.export?.isCompleted).toBe(true);
      expect(task?.placement?.isDone).toBe(false);
    });

    it('ссылку человека зеркало не подменяет', async () => {
      // `url` вписал человек, ссылка трекера живёт в выгрузке (дизайн,
      // 3.1): одно поле на две ссылки затёрло бы заметку первой выгрузкой.
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await testDb.db.transaction((tx) =>
        repository.update(member(), tx, projectId, taskId, { url: 'https://notes.example/oplata' }),
      );
      await seedExport(taskId, { externalUrl: 'https://app.weeek.net/ws/42/project/7/task/4096' });

      const [task] = await repository.findForProject(member(), projectId);

      expect(task?.url).toBe('https://notes.example/oplata');
      expect(task?.export?.externalUrl).toBe('https://app.weeek.net/ws/42/project/7/task/4096');
    });

    it('зеркало соседней задачи к этой не приклеивается', async () => {
      await grant(AccessLevel.Read);
      const exported = await seedTask('Выгружена');
      await seedTask('Не выгружена');
      await seedExport(exported, { externalId: '777' });

      const tasks = await repository.findForProject(member(), projectId);
      const byTitle = new Map(tasks.map((task) => [task.title, task.export]));

      expect(byTitle.get('Выгружена')?.externalId).toBe('777');
      expect(byTitle.get('Не выгружена')).toBeNull();
    });

    it('неудача обмена видна кодом, а зеркало остаётся прежним', async () => {
      // Код, а не текст чужого ответа: в теле бывает и сам токен, а это
      // поле уезжает на экран задачи.
      await grant(AccessLevel.Read);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { failureCode: 'tracker_unavailable' });

      const [task] = await repository.findForProject(member(), projectId);

      expect(task?.export?.failureCode).toBe('tracker_unavailable');
      expect(task?.export?.externalId).toBe('4096');
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

    it('удаляет выгруженную задачу, явно унося её зеркало', async () => {
      // Ссылка зеркала на задачу стоит `restrict`, а не каскадом (дизайн,
      // 10.5): задача в трекере остаётся жить, и унести зеркало обязан
      // явный путь удаления — тот, который и решает, что сказать человеку.
      // Без этого шага удаление выгруженной задачи приходило бы ошибкой
      // драйвера, то есть `500` вместо ответа: отказ в правах и нарушение
      // ссылки выглядят на экране одинаково — «что-то сломалось».
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);

      await testDb.db.transaction((tx) => repository.remove(member(), tx, projectId, taskId));

      expect(await testDb.rowsOf(projectTasks)).toHaveLength(0);
      expect(await testDb.rowsOf(taskExports)).toHaveLength(0);
    });

    it('зеркало соседней задачи удаление не уносит', async () => {
      // Сторож условия у `delete`: без `where` по задаче удаление одной
      // выгруженной задачи стёрло бы зеркала всего реестра, и повторная
      // выгрузка завела бы в трекере вторые копии всех задач проекта.
      await grant(AccessLevel.Write);
      const doomed = await seedTask('Оплата');
      const kept = await seedTask('Возвраты');
      await seedExport(doomed);
      await seedExport(kept, { externalId: '777' });

      await testDb.db.transaction((tx) => repository.remove(member(), tx, projectId, doomed));

      const rows = await testDb.rowsOf(taskExports);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ taskId: kept, externalId: '777' });
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
