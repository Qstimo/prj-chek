import {
  AccessLevel,
  Section,
  SubjectKind,
  TRACKER_BINDING_MISSING,
  TRACKER_NOT_CONFIGURED,
  TRACKER_REJECTED,
  TRACKER_UNAVAILABLE,
  TRACKER_LINK_REQUIRED,
  TaskExportOutcome,
  TaskOrigin,
  TrackerKind,
} from '@cairn/shared';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import {
  auditLog,
  grants,
  projectTasks,
  projects,
  subjects,
  taskExports,
  trackerProjectBindings,
  users,
} from '../db/schema';
import { DisabledTracker } from './disabled.tracker';
import { TaskExportsRepository } from './task-exports.repository';
import { EXPORT_BATCH_BUDGET_MS, TaskExportsService } from './task-exports.service';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import {
  TrackerFailure,
  type Tracker,
  type TrackerSource,
  type TrackerTaskState,
} from './tracker';

/** Токен, которого не должно быть ни в одной записи и ни в одном ответе. */
const TOKEN = 'weeek-token-ОЧЕНЬ-СЕКРЕТНЫЙ';

/** Что отвечает заглушка трекера о заведённой задаче. */
const STATE: TrackerTaskState = {
  externalId: '4096',
  externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
  boardId: '11',
  boardColumnId: '31',
  isCompleted: false,
};

describe('выгрузка задач в трекер', () => {
  let testDb: TestDatabase;
  let service: TaskExportsService;
  let projectId: string;
  let subjectId: string;
  let adminUserId: string;

  const createTask = vi.fn<Tracker['createTask']>();
  const updateTask = vi.fn<Tracker['updateTask']>();
  const readTaskLink = vi.fn<Tracker['readTaskLink']>();
  /** Выключатель заглушки: лестница «без токена порт выключен» проверяется. */
  let isEnabled = true;

  /**
   * Источник заглушки: порт берётся службой **один раз** на вызов.
   *
   * Заглушка, а не адаптер с подменённым `fetch`: здесь проверяется порядок
   * действий службы, а не разбор чужих ответов — для него есть
   * `weeek.tracker.test.ts`.
   */
  const source: TrackerSource = {
    current: async () =>
      isEnabled
        ? {
            kind: TrackerKind.Weeek,
            host: 'api.weeek.net',
            isEnabled: true,
            createTask,
            updateTask,
            readTasks: vi.fn(),
            readImportTasks: vi.fn(),
            readTaskLink,
            targets: vi.fn(),
            probe: vi.fn(),
          }
        : new DisabledTracker(),
  };

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const access = new AccessService(testDb.db);

    service = new TaskExportsService(
      testDb.db,
      // Замок задачи держится на своём соединении, пока записи обмена идут
      // своими транзакциями на рабочем: дай ему тот же пул из одного
      // соединения — и выгрузка заперла бы сама себя.
      testDb.pool(),
      new TaskExportsRepository(testDb.db, access),
      new TrackerBindingsRepository(testDb.db, access),
      new AuditService(),
      source,
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    isEnabled = true;
    readTaskLink.mockReset();
    readTaskLink.mockResolvedValue(STATE);
    createTask.mockReset();
    createTask.mockResolvedValue(STATE);
    updateTask.mockReset();
    updateTask.mockResolvedValue(STATE);

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
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
  });

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Roadmap,
      level,
      grantedBy: adminUserId,
    });
  }

  async function bind(): Promise<void> {
    await testDb.db.insert(trackerProjectBindings).values({
      projectId,
      tracker: TrackerKind.Weeek,
      externalProjectId: '7',
      boardId: '11',
      boardColumnId: '31',
      updatedBySubjectId: subjectId,
    });
  }

  async function seedTask(title: string, url: string | null = null): Promise<string> {
    const [task] = await testDb.db
      .insert(projectTasks)
      .values({ projectId, title, url, origin: TaskOrigin.Manual })
      .returning();

    return task!.id;
  }

  /** Записи журнала, старые сверху. */
  async function auditRows() {
    return testDb.db.select().from(auditLog).orderBy(asc(auditLog.createdAt));
  }

  /** Строка выгрузки задачи либо `undefined`. */
  async function exportRow(taskId: string) {
    const [row] = await testDb.db
      .select()
      .from(taskExports)
      .where(eq(taskExports.taskId, taskId));

    return row;
  }

  describe('связь по существующей ссылке', () => {
    it('сохраняет внешний id и статус, не создавая и не меняя задачу Weeek', async () => {
      await grant(AccessLevel.Write);
      await bind();
      const taskId = await seedTask('Наша формулировка', STATE.externalUrl);
      readTaskLink.mockResolvedValue({ ...STATE, isCompleted: true });
      const result = await service.link(member(), projectId, taskId);
      expect(result.externalId).toBe(STATE.externalId);
      expect(result.isCompleted).toBe(true);
      expect(result.checkedAt).not.toBeNull();
      expect(createTask).not.toHaveBeenCalled();
      expect(updateTask).not.toHaveBeenCalled();
      expect(readTaskLink).toHaveBeenCalledWith(STATE.externalUrl,
        { externalProjectId: '7', boardId: '11', boardColumnId: '31' }, expect.any(AbortSignal));
      const [task] = await testDb.db.select().from(projectTasks).where(eq(projectTasks.id, taskId));
      expect(task!.url).toBe(STATE.externalUrl);
      expect(task!.title).toBe('Наша формулировка');
      expect((await auditRows()).map((row) => row.action)).toContain(AuditAction.TaskTrackerLinked);
      await service.link(member(), projectId, taskId);
      expect(readTaskLink).toHaveBeenCalledTimes(1);
    });

    it('обычная выгрузка не создаёт дубль, если в задаче уже есть ссылка Weeek', async () => {
      await grant(AccessLevel.Write);
      await bind();
      const taskId = await seedTask('Оплата', STATE.externalUrl);
      const results = await service.export(member(), projectId, { taskIds: [taskId] });
      expect(results[0]?.failureCode).toBe(TRACKER_LINK_REQUIRED);
      expect(createTask).not.toHaveBeenCalled();
      expect(await exportRow(taskId)).toBeUndefined();
      expect(await auditRows()).toHaveLength(0);
    });

    it('без права записи не обращается к Weeek', async () => {
      await bind();
      const taskId = await seedTask('Оплата', STATE.externalUrl);
      await expect(service.link(member(), projectId, taskId)).rejects.toThrow();
      expect(readTaskLink).not.toHaveBeenCalled();
    });

    it('отказ проверки ссылки не оставляет ложную связь', async () => {
      await grant(AccessLevel.Write);
      await bind();
      const taskId = await seedTask('Оплата', STATE.externalUrl);
      readTaskLink.mockRejectedValue(new TrackerFailure(TRACKER_REJECTED, TOKEN));
      await expect(service.link(member(), projectId, taskId)).rejects.toThrow();
      expect(await exportRow(taskId)).toBeUndefined();
      expect(await auditRows()).toHaveLength(0);
      expect(createTask).not.toHaveBeenCalled();
    });
  });

  describe('право и готовность', () => {
    it('без выдачи проект не раскрывается и в сеть не идёт ни один байт', async () => {
      const taskId = await seedTask('Оплата');

      await expect(
        service.export(member(), projectId, { taskIds: [taskId] }),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);

      expect(createTask).not.toHaveBeenCalled();
      expect(await auditRows()).toHaveLength(0);
    });

    it('чтения мало: наружу уходит содержимое проекта', async () => {
      await grant(AccessLevel.Read);
      await bind();
      const taskId = await seedTask('Оплата');

      await expect(
        service.export(member(), projectId, { taskIds: [taskId] }),
      ).rejects.toBeInstanceOf(InsufficientLevelError);

      expect(createTask).not.toHaveBeenCalled();
    });

    it('недостаток права называется прежде состояния системы', async () => {
      // Порядок значим: читающему сначала говорят «мало прав», а не «доска
      // не выбрана». Обратный порядок раскрыл бы ему настройку выгрузки
      // проекта — то, чего он менять не вправе, — и отправил бы его
      // настраивать то, чем он всё равно не воспользуется.
      await grant(AccessLevel.Read);
      const taskId = await seedTask('Оплата');

      await expect(
        service.export(member(), projectId, { taskIds: [taskId] }),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('без привязки отказывает названной причиной и в сеть не идёт', async () => {
      // Класть задачу «куда-нибудь» нельзя: привязка и есть ответ на вопрос
      // «куда» (дизайн, 3.5).
      await grant(AccessLevel.Write);
      const taskId = await seedTask('Оплата');

      await expect(
        service.export(member(), projectId, { taskIds: [taskId] }),
      ).rejects.toMatchObject({ response: { code: TRACKER_BINDING_MISSING } });

      expect(createTask).not.toHaveBeenCalled();
      // Нет записи — нет и передачи; но и записи о передаче, которой не
      // будет, тоже быть не должно.
      expect(await auditRows()).toHaveLength(0);
    });

    it('без подключения отказывает и в сеть не идёт', async () => {
      // Та же лестница, что у предложителя задач и расшифровки: без токена
      // порт выключен, и выгрузки нет вовсе.
      await grant(AccessLevel.Write);
      await bind();
      isEnabled = false;
      const taskId = await seedTask('Оплата');

      await expect(
        service.export(member(), projectId, { taskIds: [taskId] }),
      ).rejects.toMatchObject({ response: { code: TRACKER_NOT_CONFIGURED } });

      expect(await auditRows()).toHaveLength(0);
    });

    it('привязка называется прежде чужой настройки', async () => {
      // Привязка — настройка его собственного проекта, и отдать сначала
      // отказ про чужую настройку значило бы отправить человека к
      // администратору, не сказав, что у него и доска не выбрана.
      await grant(AccessLevel.Write);
      isEnabled = false;
      const taskId = await seedTask('Оплата');

      await expect(
        service.export(member(), projectId, { taskIds: [taskId] }),
      ).rejects.toMatchObject({ response: { code: TRACKER_BINDING_MISSING } });
    });

    it('чужая задача в наборе — 404, и наружу не уходит ни одна из набора', async () => {
      await grant(AccessLevel.Write);
      await bind();
      const own = await seedTask('Своя');
      const [other] = await testDb.db
        .insert(projects)
        .values({ slug: 'chuzhoj', name: 'Чужой' })
        .returning();
      const [alien] = await testDb.db
        .insert(projectTasks)
        .values({ projectId: other!.id, title: 'Чужая', origin: TaskOrigin.Manual })
        .returning();

      await expect(
        service.export(member(), projectId, { taskIds: [own, alien!.id] }),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);

      expect(createTask).not.toHaveBeenCalled();
    });
  });

  describe('выгрузка', () => {
    beforeEach(async () => {
      await grant(AccessLevel.Write);
      await bind();
    });

    it('выгрузка двух задач делает два вызова и заводит два зеркала', async () => {
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая');
      createTask.mockResolvedValueOnce({ ...STATE, externalId: '1' });
      createTask.mockResolvedValueOnce({ ...STATE, externalId: '2' });

      const results = await service.export(member(), projectId, {
        taskIds: [first, second],
      });

      expect(createTask).toHaveBeenCalledTimes(2);
      expect(results.map((result) => result.outcome)).toEqual([
        TaskExportOutcome.Created,
        TaskExportOutcome.Created,
      ]);
      expect([(await exportRow(first))?.externalId, (await exportRow(second))?.externalId]).toEqual([
        '1',
        '2',
      ]);
    });

    it('наружу уходит формулировка и идентификаторы привязки — и ничего больше', async () => {
      // Ни исполнителей, ни оценок, ни дат: ТЗ 1.4 выносит их за объём, и
      // ровно за этим задачу и отправляют в трекер.
      const taskId = await seedTask('Оплата картой');

      await service.export(member(), projectId, { taskIds: [taskId] });

      expect(createTask.mock.calls[0]?.[0]).toEqual({ title: 'Оплата картой' });
      expect(createTask.mock.calls[0]?.[1]).toEqual({
        externalProjectId: '7',
        boardId: '11',
        boardColumnId: '31',
      });
    });

    it('повторная выгрузка идёт правкой с тем же идентификатором, а не вторым созданием', async () => {
      // Решение владельца: повторная выгрузка **правит** задачу в трекере.
      // Второе создание завело бы там вторую задачу молча.
      const taskId = await seedTask('Оплата');
      await service.export(member(), projectId, { taskIds: [taskId] });
      createTask.mockClear();

      const results = await service.export(member(), projectId, { taskIds: [taskId] });

      expect(createTask).not.toHaveBeenCalled();
      expect(updateTask).toHaveBeenCalledOnce();
      expect(updateTask.mock.calls[0]?.[0]).toBe('4096');
      expect(results[0]?.outcome).toBe(TaskExportOutcome.Updated);
    });

    it('повторная выгрузка не меняет ссылку наружу', async () => {
      // Ссылка на задачу в трекере — одна и та же задача: правка её не
      // переносит. Молчание ответа о ссылке известное не затирает.
      const taskId = await seedTask('Оплата');
      await service.export(member(), projectId, { taskIds: [taskId] });
      updateTask.mockResolvedValue({ ...STATE, externalUrl: null });

      const results = await service.export(member(), projectId, { taskIds: [taskId] });

      expect(results[0]?.export?.externalUrl).toBe('https://app.weeek.net/ws/4242/task/4096');
      expect(results[0]?.export?.externalId).toBe('4096');
    });

    it('ссылку, вписанную человеком, выгрузка не перезаписывает', async () => {
      // `task.url` — заметка человека, а ссылка трекера живёт в зеркале
      // (дизайн, 3.1): одно поле на две ссылки означало бы, что первая же
      // выгрузка затёрла то, что человек держал именно там.
      const taskId = await seedTask('Оплата', 'https://wiki.example/задача-про-оплату');

      await service.export(member(), projectId, { taskIds: [taskId] });

      const [task] = await testDb.db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.id, taskId));

      expect(task?.url).toBe('https://wiki.example/задача-про-оплату');
      expect((await exportRow(taskId))?.externalUrl).toBe(
        'https://app.weeek.net/ws/4242/task/4096',
      );
    });

    it('задачу, унесённую во время набора, пропускает, а не роняет 404 посреди', async () => {
      // Уронить `404` здесь значило бы потерять итоги уже уехавших задач:
      // ответ обязан прийти целым. Отправлять при этом нечего — формулировки
      // больше нет.
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая');
      createTask.mockImplementationOnce(async () => {
        await testDb.db.delete(projectTasks).where(eq(projectTasks.id, second));

        return STATE;
      });

      const results = await service.export(member(), projectId, {
        taskIds: [first, second],
      });

      expect(createTask).toHaveBeenCalledOnce();
      expect(results.map((result) => result.outcome)).toEqual([
        TaskExportOutcome.Created,
        TaskExportOutcome.Skipped,
      ]);
    });

    it('зеркало ничего не закрывает: «закрыта там» не трогает задачу здесь', async () => {
      // Расхождение «в трекере закрыто, здесь открыто» законно и
      // показывается биркой (дизайн, 5).
      const taskId = await seedTask('Оплата');
      createTask.mockResolvedValue({ ...STATE, isCompleted: true });

      const results = await service.export(member(), projectId, { taskIds: [taskId] });

      expect(results[0]?.export?.isCompleted).toBe(true);
      // Ни чекпоинта, ни признака «закрыт» у задачи выгрузка не завела.
      expect(Object.keys(results[0]!)).toEqual(['taskId', 'outcome', 'failureCode', 'export']);
    });
  });

  describe('журнал', () => {
    beforeEach(async () => {
      await grant(AccessLevel.Write);
      await bind();
    });

    it('запись о передаче идёт до первого байта наружу', async () => {
      // Нет записи — нет и передачи (инвариант ТЗ): обратный порядок
      // терял бы ровно оборвавшиеся вызовы, то есть те, о которых важнее
      // всего знать.
      const taskId = await seedTask('Оплата');
      let seenBeforeByte: string[] = [];
      createTask.mockImplementation(async () => {
        seenBeforeByte = (await auditRows()).map((row) => row.action);

        return STATE;
      });

      await service.export(member(), projectId, { taskIds: [taskId] });

      expect(seenBeforeByte).toEqual([AuditAction.TaskExported]);
    });

    it('первая выгрузка и повторная — два разных действия', async () => {
      // «Задача выгружена» о задаче, которая уехала в прошлом месяце,
      // читалось бы как появление второй задачи в чужом трекере.
      const taskId = await seedTask('Оплата');

      await service.export(member(), projectId, { taskIds: [taskId] });
      await service.export(member(), projectId, { taskIds: [taskId] });

      expect((await auditRows()).map((row) => row.action)).toEqual([
        AuditAction.TaskExported,
        AuditAction.TaskExportUpdated,
      ]);
    });

    it('метаданные называют формулировку, узел и доску, но не токен', async () => {
      const taskId = await seedTask('Оплата картой');

      await service.export(member(), projectId, { taskIds: [taskId] });

      const [row] = await auditRows();
      expect(row).toMatchObject({
        action: AuditAction.TaskExported,
        entityType: 'task',
        entityId: taskId,
        // Задача принадлежит проекту, и запись о ней — тоже.
        projectId,
      });
      expect(row?.metadata).toEqual({
        tracker: TrackerKind.Weeek,
        host: 'api.weeek.net',
        boardId: '11',
        // Формулировка названа намеренно: она и так уходит наружу, и
        // журнал передачи, умалчивающий о переданном, не отвечает на
        // вопрос, ради которого он пишется.
        title: 'Оплата картой',
        externalId: null,
      });
      expect(JSON.stringify(await auditRows())).not.toContain(TOKEN);
    });

    it('отказ трекера не отменяет записи о передаче', async () => {
      // Запись означает «формулировка ушла на такой-то адрес», и исход её
      // не отменяет: оборвавшийся вызов мог уехать целиком.
      const taskId = await seedTask('Оплата');
      createTask.mockRejectedValue(new TrackerFailure(TRACKER_UNAVAILABLE, 'узел не ответил'));

      await service.export(member(), projectId, { taskIds: [taskId] });

      expect((await auditRows()).map((row) => row.action)).toEqual([AuditAction.TaskExported]);
    });
  });

  describe('неудача обмена', () => {
    beforeEach(async () => {
      await grant(AccessLevel.Write);
      await bind();
    });

    it('отказ трекера не создаёт строки выгрузки и отвечает названным кодом', async () => {
      // Строка означает «задача в трекере есть»; завести её на отказе
      // значило бы соврать экрану о состоявшейся выгрузке, а повторная
      // выгрузка пошла бы `PUT` по идентификатору, которого нет.
      const taskId = await seedTask('Оплата');
      createTask.mockRejectedValue(new TrackerFailure(TRACKER_REJECTED, 'узел ответил 401'));

      const results = await service.export(member(), projectId, { taskIds: [taskId] });

      expect(results).toEqual([
        {
          taskId,
          outcome: TaskExportOutcome.Failed,
          failureCode: TRACKER_REJECTED,
          export: null,
        },
      ]);
      expect(await exportRow(taskId)).toBeUndefined();
    });

    it('неудача повторной выгрузки пишет код и не теряет зеркало', async () => {
      const taskId = await seedTask('Оплата');
      await service.export(member(), projectId, { taskIds: [taskId] });
      updateTask.mockRejectedValue(new TrackerFailure(TRACKER_UNAVAILABLE, 'узел не ответил'));

      const results = await service.export(member(), projectId, { taskIds: [taskId] });

      expect(results[0]?.export).toMatchObject({
        externalId: '4096',
        failureCode: TRACKER_UNAVAILABLE,
      });
    });

    it('чужое исключение без кода доезжает как «не ответил», а не как 500', async () => {
      // Различать его нечем, а в тексте бывает что угодно, включая токен.
      const taskId = await seedTask('Оплата');
      createTask.mockRejectedValue(new Error(`Bearer ${TOKEN} is invalid`));

      const results = await service.export(member(), projectId, { taskIds: [taskId] });

      expect(results[0]?.failureCode).toBe(TRACKER_UNAVAILABLE);
      expect(JSON.stringify(results)).not.toContain(TOKEN);
    });

    it('первый отказ останавливает набор, и до остальных дело не доходит', async () => {
      // Оба кода обмена описывают канал, а не строку: продолжив, выгрузка
      // сделала бы ещё сорок девять заведомо пустых походов в чужой API,
      // который считает частоту, и записала бы сорок девять записей
      // журнала о передаче, которой не было.
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая');
      createTask.mockRejectedValue(new TrackerFailure(TRACKER_REJECTED, 'узел ответил 401'));

      const results = await service.export(member(), projectId, {
        taskIds: [first, second],
      });

      expect(createTask).toHaveBeenCalledOnce();
      expect(results.map((result) => result.outcome)).toEqual([
        TaskExportOutcome.Failed,
        TaskExportOutcome.Skipped,
      ]);
      expect((await auditRows()).map((row) => row.action)).toEqual([AuditAction.TaskExported]);
    });

    it('упёршись в предел времени, набор отвечает целым и наружу больше не идёт', async () => {
      // Пятьдесят обменов по двадцать секунд — шестнадцать минут в одной
      // ручке, и за реверс-прокси (nginx, 60 с по умолчанию) человек получил
      // бы `504`, не узнав ни одного итога, а повторное нажатие пошло бы
      // `PUT` по задачам, которые уже уехали. Предел выражен в коде, а не в
      // надежде на быстрый трекер.
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая');
      const third = await seedTask('Третья');
      // Подменяется только `Date.now`, которым служба и считает срок:
      // `new Date()` остаётся настоящим, и метки времени в базе не уезжают
      // в будущее.
      const realNow = Date.now.bind(Date);
      let skew = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
      createTask.mockImplementationOnce(async () => {
        skew += EXPORT_BATCH_BUDGET_MS;

        return STATE;
      });

      try {
        const results = await service.export(member(), projectId, {
          taskIds: [first, second, third],
        });

        expect(createTask).toHaveBeenCalledOnce();
        expect(results.map((result) => result.outcome)).toEqual([
          TaskExportOutcome.Created,
          TaskExportOutcome.Skipped,
          TaskExportOutcome.Skipped,
        ]);
        // Ответ целый: у недошедших задач итог есть, зеркало прежнее, кода
        // неудачи нет — обмена с ними не было, и называть его неудавшимся
        // значило бы соврать о канале.
        expect(results[1]).toEqual({
          taskId: second,
          outcome: TaskExportOutcome.Skipped,
          failureCode: null,
          export: null,
        });
        // И ни одной записи о передаче, которой не было: журнал неизменяем.
        expect((await auditRows()).map((row) => row.action)).toEqual([
          AuditAction.TaskExported,
        ]);
      } finally {
        vi.mocked(Date.now).mockRestore();
      }
    });

    it('уже уехавшие задачи остаются выгруженными: откатывать нечего', async () => {
      // Откат унёс бы зеркало задачи, которая в чужом трекере уже лежит, —
      // и повторная выгрузка завела бы там вторую.
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая');
      createTask.mockResolvedValueOnce({ ...STATE, externalId: '1' });
      createTask.mockRejectedValueOnce(new TrackerFailure(TRACKER_UNAVAILABLE, 'узел не ответил'));

      const results = await service.export(member(), projectId, {
        taskIds: [first, second],
      });

      expect(results.map((result) => result.outcome)).toEqual([
        TaskExportOutcome.Created,
        TaskExportOutcome.Failed,
      ]);
      expect((await exportRow(first))?.externalId).toBe('1');
    });
  });
});
