import {
  ProjectLifecycle,
  SubjectKind,
  TRACKER_REJECTED,
  TRACKER_UNAVAILABLE,
  TaskOrigin,
  TrackerKind,
  type TrackerProbeResult,
  type TrackerTargets,
} from '@cairn/shared';
import { eq, sql } from 'drizzle-orm';
import { vi, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { AccessService } from '../access/access.service';
import {
  projectTasks,
  projects,
  roadmapCheckpoints,
  roadmapVersions,
  subjects,
  taskExports,
  trackerProjectBindings,
  users,
  type RoadmapCheckpointRow,
  type TaskExportRow,
} from '../db/schema';
import { TaskExportsRepository } from './task-exports.repository';
import { TRACKER_POLL_ENV } from './tracker-poll';
import {
  TrackerPollOutcome,
  TrackerPollRunnerService,
} from './tracker-poll-runner.service';
import {
  TrackerFailure,
  type Tracker,
  type TrackerSource,
  type TrackerTarget,
  type TrackerTaskInput,
  type TrackerTaskState,
} from './tracker';

/** Токен подключения: в тик он не попадает ни одним путём. */
const TOKEN = 'секретный-токен';

/** Пауза, по которой видно, что второй тик правда наткнулся на первый. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/**
 * Заглушка порта трекера: ни один тест не ходит в сеть.
 *
 * Операции выгрузки объявлены и **падают**: прогон опроса спрашивает, а не
 * говорит, и вызов `createTask` из тика означал бы, что наружу уехала
 * формулировка без записи в журнал.
 */
class StubTracker implements Tracker {
  readonly kind = TrackerKind.Weeek;
  readonly host = 'api.weeek.net';
  isEnabled = true;
  /** Токен живёт в адаптере: тест сторожит, что в базу он не попадает. */
  readonly token = TOKEN;

  /** Сколько раз спросили трекер и о каких досках. */
  readonly asked: TrackerTarget[] = [];
  /** Что отвечать на вопрос о доске; ключ — `boardId`. */
  readonly answers = new Map<string, TrackerTaskState[]>();
  /** Доски, вопрос о которых кончается отказом. */
  readonly failing = new Set<string>();
  /** Отказывать так: канал не ответил либо не принял. */
  failureCode = TRACKER_UNAVAILABLE;
  /** Задержка ответа: по ней видно, ждёт ли остановка конца тика. */
  holdMs = 0;

  readImportTasks = vi.fn<Tracker['readImportTasks']>();
  readTaskLink = vi.fn<Tracker['readTaskLink']>();

  async readTasks(target: TrackerTarget, _signal: AbortSignal): Promise<TrackerTaskState[]> {
    this.asked.push(target);

    if (this.holdMs > 0) {
      await pause(this.holdMs);
    }

    if (this.failing.has(target.boardId)) {
      throw new TrackerFailure(this.failureCode, `Трекер отказал: 502, токен ${TOKEN}`);
    }

    return this.answers.get(target.boardId) ?? [];
  }

  async createTask(
    _input: TrackerTaskInput,
    _target: TrackerTarget,
    _signal: AbortSignal,
  ): Promise<TrackerTaskState> {
    throw new Error('прогон опроса задач не заводит');
  }

  async updateTask(
    _externalId: string,
    _input: TrackerTaskInput,
    _signal: AbortSignal,
  ): Promise<TrackerTaskState> {
    throw new Error('прогон опроса формулировок не отправляет');
  }

  async targets(_signal: AbortSignal): Promise<TrackerTargets> {
    throw new Error('списки привязки прогону не нужны');
  }

  async probe(_signal: AbortSignal): Promise<TrackerProbeResult> {
    throw new Error('проверка связи живёт в администрировании');
  }
}

/** Источник, считающий обращения: порт обязан браться один раз на тик. */
class CountingSource implements TrackerSource {
  taken = 0;

  constructor(private readonly tracker: Tracker) {}

  async current(): Promise<Tracker> {
    this.taken += 1;

    return this.tracker;
  }
}

describe('прогон опроса статусов трекера', () => {
  let testDb: TestDatabase;
  let repository: TaskExportsRepository;
  let tracker: StubTracker;
  let source: CountingSource;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new TaskExportsRepository(testDb.db, new AccessService(testDb.db));
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    delete process.env[TRACKER_POLL_ENV];

    tracker = new StubTracker();
    source = new CountingSource(tracker);

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
      .values({ slug: 'vtoroj', name: 'Второй' })
      .returning();
    otherProjectId = other!.id;
  });

  afterEach(() => {
    delete process.env[TRACKER_POLL_ENV];
  });

  /**
   * Прогон на двух соединениях: замок — своим.
   *
   * Замок держит соединение на весь тик, а рабочий пул фикстуры состоит из
   * единственного соединения: занять его значило бы запереть сам прогон.
   */
  function runner(): TrackerPollRunnerService {
    return new TrackerPollRunnerService(testDb.appDb, testDb.db, repository, source);
  }

  async function seedTask(title: string, project = projectId): Promise<string> {
    const [task] = await testDb.db
      .insert(projectTasks)
      .values({ projectId: project, title, origin: TaskOrigin.Manual })
      .returning();

    return task!.id;
  }

  /** Привязка доски: без неё спрашивать нечем, и в обход проект не попадёт. */
  async function bind(
    project = projectId,
    boardId = '11',
    boardColumnId = '31',
  ): Promise<void> {
    await testDb.db.insert(trackerProjectBindings).values({
      projectId: project,
      tracker: TrackerKind.Weeek,
      externalProjectId: '7',
      boardId,
      boardColumnId,
      updatedBySubjectId: subjectId,
    });
  }

  async function seedExport(
    taskId: string,
    overrides: Partial<{
      externalId: string;
      externalUrl: string | null;
      externalBoardId: string;
      externalColumnId: string | null;
      isCompleted: boolean;
      exportedAt: Date;
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

  async function exportRow(taskId: string): Promise<TaskExportRow | undefined> {
    const [row] = await testDb.db
      .select()
      .from(taskExports)
      .where(eq(taskExports.taskId, taskId));

    return row;
  }

  /** Задача в версии: ею и проверяется, что прогресс прогон не трогает. */
  async function place(taskId: string): Promise<RoadmapCheckpointRow> {
    const [version] = await testDb.db
      .insert(roadmapVersions)
      .values({ projectId, label: 'v1.0', position: 1 })
      .returning();
    const [checkpoint] = await testDb.db
      .insert(roadmapCheckpoints)
      .values({ versionId: version!.id, taskId, position: 1 })
      .returning();

    return checkpoint!;
  }

  /** Что трекер говорит о задаче: один ответ на все проверки. */
  function state(overrides: Partial<TrackerTaskState> = {}): TrackerTaskState {
    return {
      externalId: '4096',
      externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
      boardId: '11',
      boardColumnId: '31',
      isCompleted: false,
      ...overrides,
    };
  }

  describe('опрос доски', () => {
    it('спрашивает по доске привязки и пишет зеркало', async () => {
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);
      tracker.answers.set('11', [state({ isCompleted: true, boardColumnId: '33' })]);

      expect(await runner().runAll()).toBe(TrackerPollOutcome.Done);

      expect(tracker.asked).toEqual([
        { externalProjectId: '7', boardId: '11', boardColumnId: '31' },
      ]);
      expect(await exportRow(taskId)).toMatchObject({
        isCompleted: true,
        externalColumnId: '33',
      });
    });

    it('две задачи одной доски — один вопрос', async () => {
      // Опрос идёт по доске: один `GET` отвечает обо всех её задачах, и
      // спрашивать по задаче значило бы платить частотой за то же знание.
      await bind();
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая');
      await seedExport(first, { externalId: '1' });
      await seedExport(second, { externalId: '2' });
      tracker.answers.set('11', [
        state({ externalId: '1', isCompleted: true }),
        state({ externalId: '2', isCompleted: false }),
      ]);

      await runner().runAll();

      expect(tracker.asked).toHaveLength(1);
      expect((await exportRow(first))?.isCompleted).toBe(true);
      expect((await exportRow(second))?.isCompleted).toBe(false);
    });

    it('два проекта на одной доске — один вопрос, даже когда колонки разные', async () => {
      // Группа ключуется тем, что **уходит в запрос**: в строке запроса
      // `readTasks` только проект и доска, а колонка в ней не участвует
      // вовсе. Ключ с колонкой разбил бы одну доску на две группы, то есть
      // послал бы тот же `GET` дважды за тик — в API, который считает
      // частоту.
      await bind(projectId, '11', '31');
      await bind(otherProjectId, '11', '32');
      const own = await seedTask('Своя');
      const alien = await seedTask('Вторая', otherProjectId);
      await seedExport(own, { externalId: '1' });
      await seedExport(alien, { externalId: '2' });
      tracker.answers.set('11', [
        state({ externalId: '1', isCompleted: true }),
        state({ externalId: '2', isCompleted: true }),
      ]);

      await runner().runAll();

      expect(tracker.asked).toHaveLength(1);
      // И зеркало при этом получают обе задачи: один вопрос отвечает о всей
      // доске, а не о задачах того проекта, чья колонка попала в группу.
      expect((await exportRow(own))?.isCompleted).toBe(true);
      expect((await exportRow(alien))?.isCompleted).toBe(true);
    });

    it('закрытая в трекере задача больше не опрашивается', async () => {
      // Закрытая задача не меняется, и спрашивать о ней — платить трафиком
      // за известное (дизайн, 8). Проверяется у самого прогона, а не только
      // у выборки: путь к сети начинается здесь.
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { isCompleted: true, checkedAt: null });

      await runner().runAll();

      expect(tracker.asked).toEqual([]);
      expect((await exportRow(taskId))?.checkedAt).toBeNull();
    });

    it('время проверки пишется, даже когда статус не изменился', async () => {
      // Иначе «давно не спрашивали» не отличить от «не менялось».
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, {
        isCompleted: false,
        externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
      });
      tracker.answers.set('11', [state()]);

      await runner().runAll();

      const row = await exportRow(taskId);

      expect(row?.checkedAt).not.toBeNull();
      expect(row?.isCompleted).toBe(false);
    });

    it('ответ, не назвавший задачу, зеркала не меняет', async () => {
      // Задачу унесли с доски или удалили в трекере: это не «закрыта» и не
      // «открыта», и выдумывать за молчание нельзя.
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId, { externalId: '4096', isCompleted: false });
      tracker.answers.set('11', [state({ externalId: '9999', isCompleted: true })]);

      await runner().runAll();

      const row = await exportRow(taskId);

      expect(row?.isCompleted).toBe(false);
      expect(row?.checkedAt).not.toBeNull();
    });

    it('архивный проект прогон не спрашивает', async () => {
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);
      await testDb.db
        .update(projects)
        .set({ lifecycle: ProjectLifecycle.Archived })
        .where(eq(projects.id, projectId));

      await runner().runAll();

      expect(tracker.asked).toEqual([]);
    });

    it('пустой обход порта не спрашивает вовсе', async () => {
      // Спрашивать настройку, когда спрашивать некого, значит читать базу
      // ради ничего: тик без целей обязан быть бесплатным.
      await runner().runAll();

      expect(source.taken).toBe(0);
    });

    it('порт берётся один раз на тик', async () => {
      // Увидь решение о задаче и обмен разные настройки, задача уехала бы
      // на узел, которого в настройке уже нет.
      await bind(projectId, '11');
      await bind(otherProjectId, '12');
      const own = await seedTask('Своя');
      const alien = await seedTask('Вторая', otherProjectId);
      await seedExport(own);
      await seedExport(alien, { externalBoardId: '12' });

      await runner().runAll();

      expect(tracker.asked).toHaveLength(2);
      expect(source.taken).toBe(1);
    });

    it('выключенный порт в сеть не ходит и зеркала не трогает', async () => {
      // Та же лестница, что у выгрузки: без токена порт выключен, и тик не
      // пишет ни кода неудачи — отказа не было, — ни времени проверки:
      // никто ничего не спрашивал.
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);
      tracker.isEnabled = false;

      await runner().runAll();

      expect(tracker.asked).toEqual([]);
      expect(await exportRow(taskId)).toMatchObject({ checkedAt: null, failureCode: null });
    });
  });

  describe('неудача обмена', () => {
    it('не стирает прежнее зеркало, а пишет код', async () => {
      await bind();
      const taskId = await seedTask('Оплата');
      // Закрытую в трекере задачу прогон не спрашивает вовсе, поэтому
      // зеркало здесь открытое: стирать его отказу не меньше чем есть чего
      // — ссылка наружу и колонка, в которой задачу видели.
      await seedExport(taskId, {
        externalId: '777',
        externalUrl: 'https://app.weeek.net/ws/4242/task/777',
        externalColumnId: '33',
      });
      tracker.failing.add('11');

      await runner().runAll();

      const row = await exportRow(taskId);

      expect(row).toMatchObject({
        externalId: '777',
        externalUrl: 'https://app.weeek.net/ws/4242/task/777',
        externalColumnId: '33',
        failureCode: TRACKER_UNAVAILABLE,
      });
      // Спрашивали — значит спрашивали: без отметки один мёртвый узел
      // стоял бы в голове очереди вечно.
      expect(row?.checkedAt).not.toBeNull();
    });

    it('в базу не попадает ни токен, ни текст чужого отказа', async () => {
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);
      tracker.failing.add('11');
      tracker.failureCode = TRACKER_REJECTED;

      await runner().runAll();

      const dump = JSON.stringify(await testDb.rowsOf(taskExports));

      expect(dump).toContain(TRACKER_REJECTED);
      expect(dump).not.toContain(TOKEN);
      expect(dump).not.toContain('502');
    });

    it('отказ доски останавливает тик, а остальные остаются неспрошенными', async () => {
      // Коды обмена описывают **канал**, а не строку, и отличить «отказ по
      // этой доске» от «отказ по всем» нечем: тела чужого ответа мы не
      // читаем принципиально. Остальным код неудачи не пишется — о них не
      // спрашивали, — и следующий тик начнёт с них: отметка проверки унесла
      // отказавшую доску в конец очереди.
      await bind(projectId, '11');
      await bind(otherProjectId, '12');
      const first = await seedTask('Первая');
      const second = await seedTask('Вторая', otherProjectId);
      await seedExport(first, { exportedAt: new Date('2026-11-20T10:00:00.000Z') });
      await seedExport(second, {
        externalBoardId: '12',
        exportedAt: new Date('2026-11-21T10:00:00.000Z'),
      });
      tracker.failing.add('11');

      await runner().runAll();

      expect(tracker.asked).toHaveLength(1);
      expect((await exportRow(first))?.failureCode).toBe(TRACKER_UNAVAILABLE);
      expect(await exportRow(second)).toMatchObject({ checkedAt: null, failureCode: null });
    });
  });

  describe('зеркало ничего не закрывает', () => {
    it('тик не меняет ни одного чекпоинта', async () => {
      // Решение владельца (дизайн, 5): чекпоинт закрывает человек, прогресс
      // версии считается только из чекпоинтов. Расхождение «в трекере
      // закрыто, здесь открыто» — законное состояние, которое экран
      // показывает биркой.
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);
      const before = await place(taskId);
      tracker.answers.set('11', [state({ isCompleted: true })]);

      await runner().runAll();

      const [after] = await testDb.db
        .select()
        .from(roadmapCheckpoints)
        .where(eq(roadmapCheckpoints.id, before.id));

      expect(after?.isDone).toBe(false);
      // И времени правки у размещения тик не двигает: он его не касался.
      expect(after?.updatedAt).toEqual(before.updatedAt);
      expect((await exportRow(taskId))?.isCompleted).toBe(true);
    });
  });

  describe('замок и цикл', () => {
    it('второй тик при идущем первом не начинается', async () => {
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);
      tracker.holdMs = 30;

      const live = runner();
      const first = live.runAll();

      expect(await live.runAll()).toBe(TrackerPollOutcome.Busy);
      expect(await first).toBe(TrackerPollOutcome.Done);
    });

    it('занятый замок базы даёт Busy, а не второй опрос', async () => {
      // В памяти замок не защитил бы от второго экземпляра API за прокси, а
      // два тика сразу — это два вопроса о той же доске в API, который
      // считает частоту.
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);

      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const holding = testDb.db.transaction(async (tx) => {
        // Тот же ключ, что у прогона: класс «CAIRN» (0x4341_4952), объект 3.
        // Числом, а не константой из исходника, намеренно — иначе сторож
        // проверял бы совпадение с самим собой.
        await tx.execute(sql`select pg_advisory_xact_lock(1128352082, 3)`);
        await held;
      });

      try {
        expect(await runner().runAll()).toBe(TrackerPollOutcome.Busy);
      } finally {
        release();
        await holding;
      }

      expect(tracker.asked).toEqual([]);
      expect((await exportRow(taskId))?.checkedAt).toBeNull();
    });

    it('нулевой интервал цикл не запускает', async () => {
      // Так работают тесты и локальная разработка: ни одного тика.
      process.env[TRACKER_POLL_ENV] = '0';

      const live = runner();

      live.onModuleInit();

      expect(live.hasTimer).toBe(false);
      expect(live.ticks).toBe(0);
      await live.onModuleDestroy();
    });

    it('подъём заводит таймер, но в чужой API сразу не идёт', async () => {
      // Отличие от прогонов проверок и расшифровки, и оно названное: там
      // первый тик при старте нужен, потому что без него адрес остаётся
      // «неизвестно», а загруженная запись ждёт в очереди. Здесь зеркало
      // уже лежит в базе и старше интервала не бывает, зато каждый
      // перезапуск API стучался бы в чужой API, который считает частоту.
      process.env[TRACKER_POLL_ENV] = '300';
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);

      const live = runner();

      live.onModuleInit();

      expect(live.hasTimer).toBe(true);
      expect(live.ticks).toBe(0);
      expect(tracker.asked).toEqual([]);
      await live.onModuleDestroy();
    });

    it('остановка ждёт конца идущего тика', async () => {
      // Иначе зеркало половины доски осталось бы без отметки проверки, а
      // соединение замка закрылось бы посреди записи.
      await bind();
      const taskId = await seedTask('Оплата');
      await seedExport(taskId);
      tracker.answers.set('11', [state({ isCompleted: true })]);
      tracker.holdMs = 30;

      const live = runner();
      const tick = live.runAll();

      await live.onModuleDestroy();

      expect(live.isIdle).toBe(true);
      expect((await exportRow(taskId))?.isCompleted).toBe(true);
      await tick;
    });
  });
});
