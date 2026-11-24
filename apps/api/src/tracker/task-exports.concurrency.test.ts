import {
  AccessLevel,
  Section,
  SubjectKind,
  TaskExportOutcome,
  TaskOrigin,
  TrackerKind,
} from '@cairn/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
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
import { TaskExportsRepository } from './task-exports.repository';
import { TaskExportsService } from './task-exports.service';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import type { Tracker, TrackerSource, TrackerTaskState } from './tracker';

/** Что трекер отвечает о заведённой задаче. */
const STATE: TrackerTaskState = {
  externalId: '4096',
  externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
  boardId: '11',
  boardColumnId: '31',
  isCompleted: false,
};

/** Обещание, которое разрешает сам тест: им держится идущий обмен. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

/**
 * Две одновременные выгрузки одной задачи на разных подключениях.
 *
 * Сторож решения о гонке «создать или обновить». Без замка оба писателя
 * читают «выгрузки у задачи нет», оба идут `POST /tm/tasks`, и в чужом
 * трекере появляются **две** задачи; идентификатор второй теряется начисто —
 * `recordExported` намеренно не переписывает `external_id`, и правит её потом
 * никто. Поэтому проверяется не «нет исключения», а число вызовов создания.
 *
 * Устроено по образцу `roadmap.concurrency.test.ts`: писатели на разных
 * подключениях, второй обязан **ждать** в базе, а не разойтись с первым во
 * времени. Отличие в числе пулов: писателю выгрузки нужно два соединения —
 * рабочее (журнал и запись выгрузки идут своими транзакциями) и то, на
 * котором держится замок, — поэтому замкам выдаётся по своему пулу
 * (`testDb.pool()`), а рабочим подключением оба пользуются по очереди: пока
 * первый стоит в обмене, его рабочее соединение свободно.
 */
describe('две выгрузки одной задачи сразу', () => {
  let testDb: TestDatabase;
  let first: TaskExportsService;
  let second: TaskExportsService;
  let projectId: string;
  let subjectId: string;
  let adminUserId: string;
  let taskId: string;

  /** Вызовы трекера считаются **на оба** писателя: один трекер на установку. */
  const createTask = vi.fn<Tracker['createTask']>();
  const updateTask = vi.fn<Tracker['updateTask']>();

  const source: TrackerSource = {
    current: async () => ({
      kind: TrackerKind.Weeek,
      host: 'api.weeek.net',
      isEnabled: true,
      createTask,
      updateTask,
      readTasks: vi.fn(),
      targets: vi.fn(),
      probe: vi.fn(),
    }),
  };

  function service(lockDb: TestDatabase['db']): TaskExportsService {
    const access = new AccessService(testDb.db);

    return new TaskExportsService(
      testDb.db,
      lockDb,
      new TaskExportsRepository(testDb.db, access),
      new TrackerBindingsRepository(testDb.db, access),
      new AuditService(),
      source,
    );
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    first = service(testDb.pool());
    second = service(testDb.pool());
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
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

    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Roadmap,
      level: AccessLevel.Write,
      grantedBy: adminUserId,
    });
    await testDb.db.insert(trackerProjectBindings).values({
      projectId,
      tracker: TrackerKind.Weeek,
      externalProjectId: '7',
      boardId: '11',
      boardColumnId: '31',
      updatedBySubjectId: subjectId,
    });

    const [task] = await testDb.db
      .insert(projectTasks)
      .values({ projectId, title: 'Оплата', origin: TaskOrigin.Manual })
      .returning();
    taskId = task!.id;
  });

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  /**
   * Дожидается писателя, который правда встал в базе.
   *
   * Без этой проверки сторож был бы зелёным и у кода без замка: второй
   * писатель просто успел бы начать после первого. Спрашивается сама база —
   * `pg_blocking_pids`, — а снимок статистики сбрасывается: он
   * транзакционно кэширован.
   */
  async function waitForBlockedWriter(): Promise<void> {
    const deadline = Date.now() + 10_000;

    while (Date.now() < deadline) {
      await testDb.db.execute(sql`select pg_stat_clear_snapshot()`);
      const rows = await testDb.db.execute(sql`
        select pid from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0
      `);

      if (rows.length > 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    throw new Error('Второй писатель до замка в базе так и не дошёл');
  }

  it('второй писатель ждёт первого и правит задачу, а не заводит вторую', async () => {
    const reached = deferred<void>();
    const release = deferred<void>();
    createTask.mockImplementationOnce(async () => {
      reached.resolve();
      await release.promise;

      return STATE;
    });

    const leading = first.export(member(), projectId, { taskIds: [taskId] });

    // Первый уже в обмене: решение принято и замок держится.
    await reached.promise;

    const competing = second.export(member(), projectId, { taskIds: [taskId] });
    const completed = Promise.allSettled([leading, competing]);

    try {
      await waitForBlockedWriter();
    } finally {
      release.resolve();
    }

    const [winner, loser] = await completed;

    expect(winner.status).toBe('fulfilled');
    expect(loser.status).toBe('fulfilled');
    // Главное утверждение: в трекере заведена **одна** задача.
    expect(createTask).toHaveBeenCalledOnce();
    expect(updateTask).toHaveBeenCalledOnce();
    // И правили ту, которую завели: второй писатель прочитал зеркало под
    // замком, а не то, что видел до ожидания.
    expect(updateTask.mock.calls[0]?.[0]).toBe('4096');
  });

  it('строка выгрузки остаётся одна, и журнал называет создание один раз', async () => {
    const reached = deferred<void>();
    const release = deferred<void>();
    createTask.mockImplementationOnce(async () => {
      reached.resolve();
      await release.promise;

      return STATE;
    });

    const leading = first.export(member(), projectId, { taskIds: [taskId] });

    await reached.promise;

    const competing = second.export(member(), projectId, { taskIds: [taskId] });
    const completed = Promise.allSettled([leading, competing]);

    try {
      await waitForBlockedWriter();
    } finally {
      release.resolve();
    }

    const [, loser] = await completed;

    const rows = await testDb.db
      .select()
      .from(taskExports)
      .where(eq(taskExports.taskId, taskId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe('4096');
    // Второй писатель отвечает «правка», а не «создание»: исход читается
    // человеком, и «выгружена» о задаче, которая уже лежала в трекере,
    // читалось бы как появление там второй.
    expect(
      (loser as PromiseFulfilledResult<Awaited<ReturnType<TaskExportsService['export']>>>)
        .value[0]?.outcome,
    ).toBe(TaskExportOutcome.Updated);
    // Запись о передаче — у каждого своя: формулировка уехала дважды, и
    // журнал передачи обязан сказать это дважды. А вот «выгружена» —
    // однажды.
    const entries = await testDb.db.select().from(auditLog).orderBy(asc(auditLog.createdAt));
    expect(entries.map((entry) => entry.action)).toEqual([
      AuditAction.TaskExported,
      AuditAction.TaskExportUpdated,
    ]);
  });
});
