import { randomBytes } from 'node:crypto';

import {
  AccessLevel,
  Section,
  ModelAuthScheme,
  ModelServiceKind,
  PlatformKind,
  SUMMARY_TASKS_EMPTY,
  SUGGESTER_DISABLED,
  SUMMARY_TASK_NOT_ACTIVE,
  SummaryTaskState,
  type RoadmapVersionCreate,
  type SummaryRelease,
  SUGGESTER_UNAVAILABLE,
  SUMMARY_TEXT_NOT_PLAIN,
  SUMMARY_TEXT_TOO_LONG,
  SubjectKind,
  SummaryTaskOrigin,
  TranscriberKind,
  TranscriptionState,
  ModelServicePlacement,
  type ModelServiceUpdate,
  type SummaryCreate,
} from '@cairn/shared';
import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';
import { asc, eq, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
import { CryptoService } from '../crypto/crypto.service';
import { ModelServiceSettingsService } from '../model-services/model-service-settings.service';
import { ModelServicesRepository } from '../model-services/model-services.repository';
import {
  auditLog,
  chronicleEntries,
  projects,
  roadmapVersions,
  roadmapCheckpoints,
  checkpointPlatforms,
  projectPlatforms,
  grants,
  subjects,
  summaries,
  transcriptionJobs,
  users,
} from '../db/schema';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { DisabledSuggester } from './suggester/disabled.suggester';
import { SUGGESTER_NODE_ENV_NAMES } from './suggester/settings';
import { ModelServiceTaskSuggesterSource } from './suggester/task-suggester.source';
import {
  SuggesterFailure,
  type TaskSuggester,
  type TaskSuggesterSource,
} from './suggester/task-suggester';
import { SummariesRepository } from './summaries.repository';
import { SummariesService } from './summaries.service';
import { RecordingStore } from './transcription/recording-store';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

/** Входные данные создания: текст ровно в 14 знаков — он же в журнале. */
const CREATE_INPUT: SummaryCreate = {
  occurredOn: '2026-11-16',
  title: 'Созвон по релизу',
  text: 'обсудили сроки',
};

/** Отказ порта «не ответил». Тело чужого ответа тест кладёт в сообщение. */
function unavailable(message = 'узел не ответил'): SuggesterFailure {
  return new SuggesterFailure(SUGGESTER_UNAVAILABLE, message);
}

/** Пауза, по которой видно, что вторая транзакция правда стоит на замке. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Обещание, которое разрешает тест: так ловится «вызов ещё в сети». */
function deferred(): { promise: Promise<never>; release: () => void } {
  let release = (): void => {};
  const promise = new Promise<never>((_resolve, reject) => {
    release = () => reject(unavailable('прервано тестом'));
  });

  return { promise, release };
}

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

  constructor(private readonly countSummaries: () => Promise<number>) {
    super();
  }

  override async remove(relativePath: string): Promise<void> {
    this.removed.push(relativePath);
    this.sawCommitted = (await this.countSummaries()) === 0;

    if (this.failOnRemove) {
      throw new Error('том не смонтирован');
    }
  }
}

describe('служба саммари', () => {
  let testDb: TestDatabase;
  let store: StubStore;
  let service: SummariesService;
  let disabledService: SummariesService;
  let repository: SummariesRepository;
  let audit: AuditService;
  let projectId: string;
  let adminSubjectId: string;
  let summaryId: string;

  /** Заглушка порта: ни один тест не ходит в сеть. */
  const suggesterStub: TaskSuggester & { suggest: ReturnType<typeof vi.fn> } = {
    placement: ModelServicePlacement.Local,
    model: 'тестовая',
    host: 'llm.internal',
    maxChars: 40_000,
    isEnabled: true,
    suggest: vi.fn(),
    // Проверка связи службу саммари не касается: её зовёт только
    // администрирование, и в сеть ни один тест не ходит.
    probe: vi.fn(),
  };

  /** Источник заглушки: адаптер берётся на вызов, как в боевом коде. */
  const stubSource: TaskSuggesterSource = { current: async () => suggesterStub };

  /** Источник выключенного порта: ненастроенный узел. */
  const disabledSource: TaskSuggesterSource = { current: async () => new DisabledSuggester() };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const access = new AccessService(testDb.db);
    repository = new SummariesRepository(
      testDb.db,
      access,
      new ChronicleRepository(testDb.db, access),
      new RoadmapRepository(testDb.db, access),
    );
    audit = new AuditService();
    store = new StubStore(async () => (await testDb.appDb.select({ id: summaries.id }).from(summaries)).length);
    service = new SummariesService(testDb.db, repository, audit, stubSource, new RoadmapRepository(testDb.db, access), store);
    // Вторая служба на выключенном порте: источник отдаёт выключенный
    // адаптер на каждом вызове — так же, как в боевом коде.
    disabledService = new SummariesService(
      testDb.db,
      repository,
      audit,
      disabledSource,
      new RoadmapRepository(testDb.db, access),
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
    vi.restoreAllMocks();
    suggesterStub.suggest.mockReset();
    suggesterStub.suggest.mockResolvedValue({
      tasks: [{ title: 'раз' }, { title: 'два' }],
      dropped: 0,
    });

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    adminSubjectId = adminSubject!.id;
    await testDb.db.insert(users).values({
      subjectId: adminSubjectId,
      email: 'admin@cairn.local',
      passwordHash: 'хэш',
      isSuperadmin: true,
    });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    summaryId = (await service.create(writer(), projectId, CREATE_INPUT)).id;
  });

  const writer = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  /**
   * Служба со своим репозиторием на заданном соединении.
   *
   * Нужна проверке одновременных нажатий: у клиентов фикстуры `max: 1`,
   * и две транзакции на одном соединении не живут одновременно.
   */
  function serviceOn(db: typeof testDb.db): {
    service: SummariesService;
    repository: SummariesRepository;
  } {
    const access = new AccessService(db);
    const roadmap = new RoadmapRepository(db, access);
    const own = new SummariesRepository(db, access, new ChronicleRepository(db, access), roadmap);

    return {
      repository: own,
      service: new SummariesService(db, own, audit, stubSource, roadmap, store),
    };
  }

  /** Расшифровка над саммари вставкой: подготовка данных, а не проверка прав. */
  async function addJob(summaryId: string): Promise<string> {
    const id = crypto.randomUUID();
    await testDb.db.insert(transcriptionJobs).values({
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
    });

    return id;
  }

  /** Записи журнала по действию, старые сверху. */
  async function auditRecords(action: AuditAction) {
    return testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, action))
      .orderBy(asc(auditLog.createdAt));
  }

  /** Все действия журнала, относящиеся к саммари. */
  async function summaryActions(): Promise<string[]> {
    const rows = await testDb.db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(like(auditLog.action, 'summary.%'))
      .orderBy(asc(auditLog.createdAt));

    return rows.map((row) => row.action);
  }

  /** Текст записи хроники длиной в заданное число знаков. */
  async function seedLongText(chars: number): Promise<void> {
    await testDb.db.update(chronicleEntries).set({ content: 'я'.repeat(chars) });
  }

  /** Ошибка вызова как значение: так читаются и код, и тело ответа. */
  async function failureOf(call: Promise<unknown>): Promise<unknown> {
    return call.then(
      () => {
        throw new Error('ожидался отказ');
      },
      (cause: unknown) => cause,
    );
  }

  describe('смена настройки без перезапуска', () => {
    let liveService: SummariesService;
    let settingsRepository: ModelServicesRepository;
    let savedEnv: Record<string, string | undefined>;

    /** Настройка узла в базе: тест меняет в ней одно поле. */
    const nodeInput: ModelServiceUpdate = {
      baseUrl: 'https://pervyj.example/v1',
      authScheme: ModelAuthScheme.Bearer,
      model: 'первая',
      folder: null,
      placement: ModelServicePlacement.External,
      timeoutSeconds: 60,
      isEnabled: true,
    };

    /** Ответ OpenAI-совместимого узла: в сеть не ходит ни один тест. */
    function completion(): Response {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"tasks":["раз"]}' } }] }),
        { status: 200 },
      );
    }

    /** Сохраняет настройку узла так, как это сделал бы администратор. */
    async function save(overrides: Partial<ModelServiceUpdate> = {}): Promise<void> {
      await settingsRepository.save(
        testDb.db,
        ModelServiceKind.TaskSuggester,
        adminSubjectId,
        { ...nodeInput, secret: 'ключ', ...overrides },
      );
    }

    /** Имена моделей из записей журнала о передаче, старые сверху. */
    async function suggestedModels(): Promise<unknown[]> {
      const rows = await auditRecords(AuditAction.SummaryTasksSuggested);

      return rows.map((row) => (row.metadata as { model?: unknown } | null)?.model);
    }

    beforeEach(() => {
      const access = new AccessService(testDb.db);
      settingsRepository = new ModelServicesRepository(
        testDb.db,
        new CryptoService(randomBytes(32).toString('base64')),
      );
      liveService = new SummariesService(
        testDb.db,
        repository,
        audit,
        new ModelServiceTaskSuggesterSource(
          new ModelServiceSettingsService(testDb.db, settingsRepository),
        ),
        new RoadmapRepository(testDb.db, access),
        store,
      );

      // Окружение чистое: иначе ключ из оболочки разработчика включал бы
      // узел там, где проверяется ненастроенный.
      savedEnv = Object.fromEntries(
        SUGGESTER_NODE_ENV_NAMES.map((name) => [name, process.env[name]]),
      );
      for (const name of SUGGESTER_NODE_ENV_NAMES) {
        delete process.env[name];
      }
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      for (const name of SUGGESTER_NODE_ENV_NAMES) {
        if (savedEnv[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = savedEnv[name];
        }
      }
    });

    it('смена настройки действует на следующем вызове, без перезапуска', async () => {
      // Отмена запрета «порт выбирается один раз при старте»: отмена
      // названа, и взамен каждая смена попадает в журнал (дизайн, 9.1).
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion())));

      await save({ model: 'первая' });
      await liveService.suggest(writer(), projectId, summaryId);

      await save({ model: 'вторая' });
      await liveService.suggest(writer(), projectId, summaryId);

      expect(await suggestedModels()).toEqual(['первая', 'вторая']);
    });

    it('подпись над кнопкой читает действующую настройку, а не снимок старта', async () => {
      // Отстать негде: `suggesterInfo` строится из той же разрешённой
      // настройки, из которой строится адаптер (дизайн, 9.1 пункт 2).
      await save({ model: 'первая' });
      expect(await liveService.suggesterInfo()).toMatchObject({ model: 'первая' });

      await save({ model: 'вторая' });
      expect(await liveService.suggesterInfo()).toMatchObject({
        model: 'вторая',
        host: 'pervyj.example',
        isEnabled: true,
      });
    });

    it('вызов, ушедший в сеть, доходит на прежней настройке', async () => {
      // Иначе журнал называл бы один узел, а текст уехал бы на другой —
      // то есть журнал начал бы врать о передаче, о которой он
      // единственный след (дизайн, 9.3).
      await save({ baseUrl: 'https://pervyj.example/v1' });
      let release = (): void => {};
      const fetchMock = vi.fn(
        (_url: string, _init: RequestInit) =>
          new Promise<Response>((resolve) => {
            release = () => resolve(completion());
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const inFlight = liveService.suggest(writer(), projectId, summaryId);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await save({ baseUrl: 'https://vtoroj.example/v1' });
      release();
      await inFlight;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(new URL(String(fetchMock.mock.calls[0]?.[0])).hostname).toBe('pervyj.example');
    });

    it('ненастроенный узел даёт выключенный порт, а не падение', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const error = await failureOf(liveService.suggest(writer(), projectId, summaryId));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: SUGGESTER_DISABLED,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('снятый ключ выключает порт на следующем вызове', async () => {
      // Та же отмена с другой стороны: администратор очистил поле, и
      // передача наружу прекращается без перезапуска API.
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion())));
      await save();
      await liveService.suggest(writer(), projectId, summaryId);

      await save({ secret: null });

      const error = await failureOf(liveService.suggest(writer(), projectId, summaryId));
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: SUGGESTER_DISABLED,
      });
    });
  });

  describe('формирование релиза', () => {
    beforeEach(async () => {
      await service.suggest(writer(), projectId, summaryId);
      const detail = await service.findById(writer(), projectId, summaryId);
      await service.replaceTasks(writer(), projectId, summaryId, {
        tasks: [...detail.tasks.map(({ id, title }) => ({ id, title })), { title: 'три' }],
      });
    });

    async function releaseInput(version: RoadmapVersionCreate): Promise<SummaryRelease> {
      const detail = await service.findById(writer(), projectId, summaryId);
      return {
        taskIds: detail.tasks.filter((task) => task.state === SummaryTaskState.Active).map((task) => task.id),
        target: { kind: 'new', version },
      };
    }

    it('создаёт версию, упорядоченные незакрытые чекпоинты и полный журнал', async () => {
      const result = await service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.3' }));
      expect(result).toEqual({ versionId: expect.any(String), label: 'v1.3', checkpointCount: 3 });
      const rows = await testDb.db.select().from(roadmapCheckpoints).orderBy(asc(roadmapCheckpoints.position));
      expect(rows.map(({ position, title, isDone, url }) => [position, title, isDone, url])).toEqual([
        [1, 'раз', false, null], [2, 'два', false, null], [3, 'три', false, null],
      ]);
      expect(await testDb.db.select().from(checkpointPlatforms)).toEqual([]);
      expect((await testDb.db.select().from(summaries))[0]?.releasedVersionId).toBe(result.versionId);
      expect((await auditRecords(AuditAction.SummaryReleased))[0]?.metadata).toEqual({ versionId: result.versionId, label: 'v1.3', tasks: 3, fromModel: 2, target: 'new' });
      expect(await auditRecords(AuditAction.RoadmapVersionCreated)).toHaveLength(1);
      expect((await auditRecords(AuditAction.CheckpointCreated)).map(row => row.metadata)).toEqual([
        { title: 'раз' }, { title: 'два' }, { title: 'три' },
      ]);
    });

    it('выборочный релиз соблюдает позиции, а возвращённая задача уезжает во вторую версию', async () => {
      const [first, second, third] = (await service.findById(writer(), projectId, summaryId)).tasks;
      const input = { taskIds: [third!.id, first!.id], target: { kind: 'new', version: { label: 'v1.3' } } } as const;
      const result = await service.release(writer(), projectId, summaryId, { ...input, taskIds: [...input.taskIds] });
      expect(result.checkpointCount).toBe(2);
      const checkpoints = await testDb.db.select().from(roadmapCheckpoints).orderBy(asc(roadmapCheckpoints.position));
      expect(checkpoints.map((task) => task.title)).toEqual(['раз', 'три']);
      const detail = await service.findById(writer(), projectId, summaryId);
      expect(detail).toMatchObject({ taskCount: 1, archivedCount: 0, releasedCount: 2 });
      expect(detail.tasks).toEqual([
        expect.objectContaining({ id: first!.id, state: SummaryTaskState.Released, releasedVersionId: result.versionId }),
        expect.objectContaining({ id: second!.id, state: SummaryTaskState.Active, releasedVersionId: null }),
        expect.objectContaining({ id: third!.id, state: SummaryTaskState.Released, releasedVersionId: result.versionId }),
      ]);
      const selection = { taskIds: [second!.id] };
      await service.archiveTasks(writer(), projectId, summaryId, selection);
      await expect(service.release(writer(), projectId, summaryId, {
        ...selection, target: { kind: 'new', version: { label: 'v1.4' } },
      })).rejects.toMatchObject({ status: 409, response: { code: SUMMARY_TASK_NOT_ACTIVE } });
      await service.restoreTasks(writer(), projectId, summaryId, selection);
      expect((await auditRecords(AuditAction.SummaryTasksArchived))[0]?.metadata).toEqual({ tasks: 1 });
      expect((await auditRecords(AuditAction.SummaryTasksRestored))[0]?.metadata).toEqual({ tasks: 1 });
      const next = await service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.4' }));
      expect(next.versionId).not.toBe(result.versionId);
      expect(await testDb.rowsOf(roadmapVersions)).toHaveLength(2);
      expect(await service.findById(writer(), projectId, summaryId)).toMatchObject({
        releasedVersionId: next.versionId, taskCount: 0, releasedCount: 3,
      });
    });

    it('новая разбивка после релиза оставляет уехавшие задачи', async () => {
      const { taskIds, target } = await releaseInput({ label: 'v1.3' });
      const releasedId = taskIds[0]!;
      await service.release(writer(), projectId, summaryId, { taskIds: [releasedId], target });
      suggesterStub.suggest.mockResolvedValueOnce({ tasks: [{ title: 'Следующая задача' }], dropped: 4 });

      const detail = await service.suggest(writer(), projectId, summaryId);

      expect(detail).toMatchObject({ taskCount: 1, releasedCount: 1, suggester: { dropped: 4 } });
      expect(detail.tasks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: releasedId, title: 'раз', state: SummaryTaskState.Released }),
        expect.objectContaining({ title: 'Следующая задача', state: SummaryTaskState.Active }),
      ]));
    });

    it('журнал удаления считает фактически удалённые задачи', async () => {
      const { taskIds } = await releaseInput({ label: 'v1' });
      await service.removeTasks(writer(), projectId, summaryId, { taskIds: [taskIds[0]!, taskIds[1]!, taskIds[0]!] });
      expect((await auditRecords(AuditAction.SummaryTasksDeleted))[0]?.metadata).toEqual({ tasks: 2 });
      expect((await service.findById(writer(), projectId, summaryId)).tasks.map((task) => task.id)).toEqual([taskIds[2]]);
    });

    it('добавляет чекпоинты в существующую версию без записи о её создании', async () => {
      const [version] = await testDb.db.insert(roadmapVersions).values({ projectId, label: 'v2', position: 1 }).returning();
      const { taskIds } = await releaseInput({ label: 'v2' });
      const result = await service.release(writer(), projectId, summaryId, {
        taskIds, target: { kind: 'existing', versionId: version!.id },
      });
      expect(result).toEqual({ versionId: version!.id, label: 'v2', checkpointCount: 3 });
      expect((await testDb.rowsOf(roadmapCheckpoints)).map((row) => row.versionId)).toEqual(Array(3).fill(version!.id));
      expect(await auditRecords(AuditAction.RoadmapVersionCreated)).toEqual([]);
      expect((await auditRecords(AuditAction.SummaryReleased))[0]?.metadata).toEqual({
        versionId: version!.id, label: 'v2', fromModel: 2, tasks: 3, target: 'existing',
      });
    });

    it('не добавляет чекпоинты в версию другого проекта', async () => {
      const [other] = await testDb.db.insert(projects).values({ slug: 'other', name: 'Другой' }).returning();
      const [version] = await testDb.db.insert(roadmapVersions)
        .values({ projectId: other!.id, label: 'v2', position: 1 }).returning();
      const { taskIds } = await releaseInput({ label: 'v2' });
      await expect(service.release(writer(), projectId, summaryId, {
        taskIds, target: { kind: 'existing', versionId: version!.id },
      })).rejects.toMatchObject({ status: 404 });
      expect(await testDb.rowsOf(roadmapCheckpoints)).toEqual([]);
    });

    it('пустой черновик — 409 с кодом', async () => {
      await service.replaceTasks(writer(), projectId, summaryId, { tasks: [] });
      await expect(service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.3' }))).rejects.toMatchObject({
        status: 409, response: expect.objectContaining({ code: SUMMARY_TASKS_EMPTY }),
      });
    });

    it('ошибка второго чекпоинта откатывает версию, чекпоинты, журнал и отметку', async () => {
      const original = RoadmapRepository.prototype.createCheckpoint;
      let calls = 0;
      vi.spyOn(RoadmapRepository.prototype, 'createCheckpoint').mockImplementation(async function (this: RoadmapRepository, ...args) {
        if (++calls === 2) throw new Error('второй чекпоинт');
        return original.apply(this, args);
      });
      await expect(service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.3' }))).rejects.toThrow('второй чекпоинт');
      expect(await testDb.db.select().from(roadmapVersions)).toEqual([]);
      expect(await testDb.db.select().from(roadmapCheckpoints)).toEqual([]);
      expect(await auditRecords(AuditAction.RoadmapVersionCreated)).toEqual([]);
      expect(await auditRecords(AuditAction.CheckpointCreated)).toEqual([]);
      expect(await auditRecords(AuditAction.SummaryReleased)).toEqual([]);
      expect((await testDb.db.select().from(summaries))[0]?.releasedVersionId).toBeNull();
    });

    it('одновременные нажатия дают одну версию и один конфликт', async () => {
      // Два **соединения** и ручная координация, как у соседней проверки
      // замены: у клиента фикстуры `max: 1`, и на одном соединении
      // вторая транзакция не начинается до коммита первой — PostgreSQL
      // двух открытых не видит, и замок строки в проверке не участвовал
      // бы вовсе. Убери `.for('no key update')` — тест обязан покраснеть.
      const second = serviceOn(testDb.appDb);
      let locked = (): void => {};
      let resumeFirst = (): void => {};
      let reachedLock = (): void => {};
      let passedLock = (): void => {};
      const held = new Promise<void>((resolve) => { locked = resolve; });
      const resume = new Promise<void>((resolve) => { resumeFirst = resolve; });
      const reached = new Promise<void>((resolve) => { reachedLock = resolve; });
      const passed = new Promise<void>((resolve) => { passedLock = resolve; });

      // Первое нажатие замирает, уже взяв замок строки саммари: замок
      // берётся в `tasksForRelease`, то есть до создания версии.
      const createVersion = RoadmapRepository.prototype.createVersion;
      vi.spyOn(RoadmapRepository.prototype, 'createVersion').mockImplementationOnce(
        async function (this: RoadmapRepository, ...args) {
          locked();
          await resume;
          return createVersion.apply(this, args);
        },
      );
      const tasksForRelease = second.repository.tasksForRelease.bind(second.repository);
      vi.spyOn(second.repository, 'tasksForRelease').mockImplementation(async (...args) => {
        reachedLock();
        const row = await tasksForRelease(...args);
        passedLock();
        return row;
      });

      const firstInput = await releaseInput({ label: 'v1.3' });
      const secondInput = await releaseInput({ label: 'v1.4' });
      const first = service.release(writer(), projectId, summaryId, firstInput);
      await held;
      const concurrent = second.service.release(writer(), projectId, summaryId, secondInput);
      await reached;
      // Замок держит — второе нажатие стоит, и первое отпускается по
      // паузе; замка нет — второе уже прочитало незанятую строку, и
      // ждать нечего.
      await Promise.race([passed, pause(250)]);
      resumeFirst();

      const results = await Promise.allSettled([first, concurrent]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, response: expect.objectContaining({ code: SUMMARY_TASK_NOT_ACTIVE }) } });
      expect(await testDb.rowsOf(roadmapVersions)).toHaveLength(1);
    });

    it.each(['ручная', 'предложенная'])('замена %s после чтения до релиза сохраняет уехавшие задачи', async (kind) => {
      let signalRead = (): void => {};
      let resumeWrite = (): void => {};
      const read = new Promise<void>((resolve) => { signalRead = resolve; });
      const resume = new Promise<void>((resolve) => { resumeWrite = resolve; });
      const requireForWrite = repository.requireForWrite.bind(repository);
      vi.spyOn(repository, 'requireForWrite').mockImplementationOnce(async (...args) => {
        const row = await requireForWrite(...args);
        // Обе транзакции реально читают базу: задерживаем только возврат
        // старой строки, чтобы релиз гарантированно успел закоммититься.
        signalRead();
        await resume;
        return row;
      });
      const replacement = testDb.appDb.transaction((tx) => kind === 'ручная'
        ? repository.replaceTasks(writer(), tx, projectId, summaryId, { tasks: [{ title: 'Опоздавшая правка' }] })
        : repository.replaceWithSuggested(writer(), tx, projectId, summaryId, ['Опоздавшая разбивка'], {
          name: 'local', model: 'тест', textUpdatedAt: new Date(), dropped: 0,
        }));
      const outcome = replacement.then(() => null, (cause: unknown) => cause);
      try {
        await read;
        await service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.3' }));
      } finally {
        resumeWrite();
      }
      expect(await outcome).toBeNull();
      const detail = await service.findById(writer(), projectId, summaryId);
      const checkpoints = await testDb.db.select().from(roadmapCheckpoints).orderBy(asc(roadmapCheckpoints.position));
      expect(detail.tasks.filter((task) => task.state === SummaryTaskState.Released).map((task) => task.title))
        .toEqual(checkpoints.map((checkpoint) => checkpoint.title));
      expect(detail.tasks.filter((task) => task.state === SummaryTaskState.Active).map((task) => task.title))
        .toEqual([kind === 'ручная' ? 'Опоздавшая правка' : 'Опоздавшая разбивка']);
    });

    it('занятое обозначение отвергает репозиторий роадмапа', async () => {
      await testDb.db.insert(roadmapVersions).values({ projectId, label: 'v1.3', position: 1 });
      await expect(service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.3' }))).rejects.toBeInstanceOf(ConflictException);
    });

    it('releasedDate при платформе отвергает репозиторий роадмапа', async () => {
      await testDb.db.insert(projectPlatforms).values({ projectId, name: 'Веб', kind: PlatformKind.Server, position: 1 });
      await expect(service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.3', releasedDate: null }))).rejects.toBeInstanceOf(ConflictException);
    });

    it('устаревший текст не блокирует релиз', async () => {
      await testDb.db.update(chronicleEntries).set({ updatedAt: new Date(Date.now() + 60_000) });
      expect((await service.findById(writer(), projectId, summaryId)).isTextStale).toBe(true);
      await expect(service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.3' }))).resolves.toBeDefined();
    });

    it.each([
      [AccessLevel.Write, undefined, 404],
      [AccessLevel.Write, AccessLevel.Read, 403],
      [undefined, AccessLevel.Write, 404],
      [AccessLevel.Read, AccessLevel.Write, 403],
      [AccessLevel.Read, undefined, 404],
      [undefined, AccessLevel.Read, 404],
    ])('права хроники %s и роадмапа %s дают %s', async (chronicle, roadmap, status) => {
      const [member] = await testDb.db.insert(subjects).values({ kind: SubjectKind.User, label: 'участник' }).returning();
      const [admin] = await testDb.db.select().from(users).where(eq(users.subjectId, adminSubjectId));
      for (const [section, level] of [[Section.Chronicle, chronicle], [Section.Roadmap, roadmap]] as const) {
        if (level) await testDb.db.insert(grants).values({ subjectId: member!.id, projectId, section, level, grantedBy: admin!.id });
      }
      await expect(service.release({ ...writer(), id: member!.id, isSuperadmin: false }, projectId, summaryId, await releaseInput({ label: 'v1.3' }))).rejects.toMatchObject({ status });
    });

    describe('ссылка и теги доезжают в чекпоинт', () => {
      let apiPlatformId: string;

      beforeEach(async () => {
        const [platform] = await testDb.db
          .insert(projectPlatforms)
          .values({ projectId, name: 'API', kind: PlatformKind.Server, position: 1 })
          .returning();
        apiPlatformId = platform!.id;
      });

      /** Размечает первую строку черновика, остальные оставляет как есть. */
      async function tagFirstTask(platformId = apiPlatformId): Promise<void> {
        const detail = await service.findById(writer(), projectId, summaryId);

        await service.replaceTasks(writer(), projectId, summaryId, {
          tasks: detail.tasks.map(({ id, title }, index) =>
            index === 0
              ? { id, title, url: 'https://tracker.example/1', platformIds: [platformId] }
              : { id, title },
          ),
        });
      }

      it('чекпоинт получает ссылку и теги задачи', async () => {
        // Путь записи один: поля доезжают существующим `createCheckpoint`,
        // который их принимает уже сегодня. Роадмап не правится.
        await tagFirstTask();

        await service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.4' }));

        const rows = await testDb.db
          .select()
          .from(roadmapCheckpoints)
          .orderBy(asc(roadmapCheckpoints.position));

        expect(rows.map((row) => row.url)).toEqual(['https://tracker.example/1', null, null]);
        expect(await testDb.rowsOf(checkpointPlatforms)).toEqual([
          { checkpointId: rows[0]!.id, platformId: apiPlatformId },
        ]);
      });

      it('задача без ссылки и тегов даёт чекпоинт без них', async () => {
        await service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.5' }));

        const rows = await testDb.rowsOf(roadmapCheckpoints);

        expect(rows.map((row) => row.url)).toEqual([null, null, null]);
        expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
      });

      it('журнал чекпоинта не меняется: только формулировка', async () => {
        // У штатного создания чекпоинта в метаданных тоже один `title`, и
        // расхождение означало бы, что приехавший из саммари чекпоинт
        // журналируется иначе.
        await tagFirstTask();

        await service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.4' }));

        expect((await auditRecords(AuditAction.CheckpointCreated))[0]?.metadata).toEqual({
          title: 'раз',
        });
      });

      it('чужая платформа в черновике отвергает весь релиз', async () => {
        // Вторая проверка не заводится: её держит `RoadmapRepository`.
        // Названная граница — редактор такого черновика создать не может
        // (дизайн, 5.5).
        const [other] = await testDb.db
          .insert(projects)
          .values({ slug: 'chuzhoj', name: 'Чужой' })
          .returning();
        const [foreign] = await testDb.db
          .insert(projectPlatforms)
          .values({
            projectId: other!.id,
            name: 'Чужая',
            kind: PlatformKind.Server,
            position: 1,
          })
          .returning();
        await tagFirstTask(foreign!.id);

        await expect(
          service.release(writer(), projectId, summaryId, await releaseInput({ label: 'v1.6' })),
        ).rejects.toBeInstanceOf(SectionNotVisibleError);

        expect(await testDb.rowsOf(roadmapVersions)).toHaveLength(0);
        expect((await testDb.rowsOf(summaries))[0]?.releasedVersionId).toBeNull();
      });
    });
  });

  describe('создание', () => {
    it('приводит переводы строк к LF и считает длину по приведённому', async () => {
      // Нормализация идёт и на сервере (дизайн, 3.1): иначе один и тот
      // же текст менял бы длину от платформы автора, и предел порта с
      // числом `chars` в журнале считали бы разное.
      const created = await service.create(writer(), projectId, {
        ...CREATE_INPUT,
        text: 'раз\r\nдва',
      });

      expect(created.text).toBe('раз\nдва');
      expect((await auditRecords(AuditAction.SummaryCreated))[1]?.metadata).toMatchObject({
        chars: 7,
      });
    });

    it('снимает один ведущий BOM', async () => {
      const created = await service.create(writer(), projectId, {
        ...CREATE_INPUT,
        text: 'обсудили сроки',
      });

      expect(created.text).toBe('обсудили сроки');
    });

    it.each([
      ['NUL', '\u0000'],
      ['прочий управляющий символ', '\u0007'],
    ])('%s отвергает названным отказом, а не падением драйвера', async (_name, char) => {
      // `NUL` до колонки `text` в PostgreSQL не доходит вовсе и давал
      // `22021` драйвера, то есть `500` вместо отказа с кодом.
      const error = await failureOf(
        service.create(writer(), projectId, { ...CREATE_INPUT, text: `раз${char}два` }),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: SUMMARY_TEXT_NOT_PLAIN,
      });
      expect(await testDb.rowsOf(summaries)).toHaveLength(1);
    });

    it('пишет в журнал заголовок, дату и длину текста, но не текст', async () => {
      const [record] = await auditRecords(AuditAction.SummaryCreated);

      expect(record?.metadata).toEqual({
        title: 'Созвон по релизу',
        occurredOn: '2026-11-16',
        chars: 14,
      });
      expect(JSON.stringify(record)).not.toContain('обсудили сроки');
    });

    it('запись хроники тоже получает свою строку журнала', async () => {
      // Иначе запись появлялась бы в хронике без следа: создание идёт
      // репозиторием хроники, а не её службой.
      expect(await auditRecords(AuditAction.ChronicleEntryCreated)).toHaveLength(1);
    });
  });

  describe('разбивка текста на задачи', () => {
    it('успех заменяет черновик и помечает строки машинными', async () => {
      const detail = await service.suggest(writer(), projectId, summaryId);

      expect(detail.tasks.map((task) => task.title)).toEqual(['раз', 'два']);
      expect(detail.tasks.map((task) => task.origin)).toEqual([
        SummaryTaskOrigin.Model,
        SummaryTaskOrigin.Model,
      ]);
      expect(detail.suggester).toMatchObject({ model: 'тестовая', name: 'local' });
    });

    it.each([0, 7])('отброшенные %s сохраняются и читаются новым репозиторием под ролью приложения', async (dropped) => {
      suggesterStub.suggest.mockResolvedValue({ tasks: [{ title: 'Сохранённая задача' }], dropped });
      const detail = await service.suggest(writer(), projectId, summaryId);
      expect(detail.suggester?.dropped).toBe(dropped);
      const access = new AccessService(testDb.appDb);
      const reloaded = new SummariesRepository(testDb.appDb, access,
        new ChronicleRepository(testDb.appDb, access), new RoadmapRepository(testDb.appDb, access));
      expect((await reloaded.findById(writer(), projectId, summaryId)).suggester?.dropped).toBe(dropped);
      await service.replaceTasks(writer(), projectId, summaryId, { tasks: [{ title: 'Правка человеком' }] });
      expect((await reloaded.findById(writer(), projectId, summaryId)).suggester?.dropped).toBe(dropped);
    });

    it('новая разбивка заменяет число, а отказ сохраняет прежнюю отметку', async () => {
      suggesterStub.suggest.mockResolvedValue({ tasks: [{ title: 'Задача' }], dropped: 7 });
      await service.suggest(writer(), projectId, summaryId);
      suggesterStub.suggest.mockRejectedValue(unavailable());
      await expect(service.suggest(writer(), projectId, summaryId)).rejects.toThrow();
      expect((await service.findById(writer(), projectId, summaryId)).suggester?.dropped).toBe(7);
      suggesterStub.suggest.mockResolvedValue({ tasks: [{ title: 'Другая' }], dropped: 0 });
      expect((await service.suggest(writer(), projectId, summaryId)).suggester?.dropped).toBe(0);
    });

    it('предложителю уходит ровно текст записи и сигнал', async () => {
      // Выбор того, что уходит наружу, делается здесь, а не в адаптере:
      // адаптер названия проекта, адресов и переменных не получает
      // физически, и искать их в теле запроса к нему нечем. Проверять
      // надо вызов: третий аргумент с «контекстом проекта» утёк бы
      // наружу целиком (дизайн, 5.7).
      await service.suggest(writer(), projectId, summaryId);

      expect(suggesterStub.suggest).toHaveBeenCalledWith(
        'обсудили сроки',
        expect.any(AbortSignal),
      );
    });

    it('запись о передаче пишется до обращения к предложителю', async () => {
      // Нет записи — нет и передачи: иначе падение процесса оставило бы
      // текст ушедшим наружу без следа.
      const order: string[] = [];
      suggesterStub.suggest.mockImplementation(async () => {
        order.push('сеть');

        return { tasks: [{ title: 'раз' }], dropped: 0 };
      });
      vi.spyOn(audit, 'record').mockImplementation(async (tx, actor, entry) => {
        if (entry.action === AuditAction.SummaryTasksSuggested) {
          order.push('журнал');
        }

        return AuditService.prototype.record.call(audit, tx, actor, entry);
      });

      await service.suggest(writer(), projectId, summaryId);

      expect(order).toEqual(['журнал', 'сеть']);
    });

    it('в журнале передачи — узел и длина, но не текст', async () => {
      await service.suggest(writer(), projectId, summaryId);

      const [record] = await auditRecords(AuditAction.SummaryTasksSuggested);

      expect(record?.metadata).toEqual({
        suggester: 'local',
        model: 'тестовая',
        host: 'llm.internal',
        chars: 14,
      });
      expect(JSON.stringify(record)).not.toContain('обсудили сроки');
    });

    it('«задач нет» — успех с нулём задач, а не отказ узла', async () => {
      // Системная инструкция сама просит вернуть пустой список у
      // созвона без задач: объявлять это отказом значило бы брать за тот
      // же текст второй раз и писать в журнал неудачу, которой не было.
      suggesterStub.suggest.mockResolvedValue({ tasks: [], dropped: 0 });

      const detail = await service.suggest(writer(), projectId, summaryId);

      expect(detail.tasks).toEqual([]);
      expect(detail.suggester).toMatchObject({ name: 'local', dropped: 0 });
      expect(await auditRecords(AuditAction.SummaryTasksSuggestionFailed)).toHaveLength(0);
      expect(await summaryActions()).toEqual([
        AuditAction.SummaryCreated,
        AuditAction.SummaryTasksSuggested,
      ]);
    });

    it('«задач нет» не затирает правленный руками черновик', async () => {
      // Применять нечего — и затирать список, который человек правил
      // двадцать минут, тоже нечем.
      await service.replaceTasks(writer(), projectId, summaryId, { tasks: [{ title: 'моё' }] });
      suggesterStub.suggest.mockResolvedValue({ tasks: [], dropped: 0 });

      const detail = await service.suggest(writer(), projectId, summaryId);

      expect(detail.tasks.map((task) => task.title)).toEqual(['моё']);
      expect(detail.tasks.map((task) => task.origin)).toEqual([SummaryTaskOrigin.Human]);
    });

    it('отказ оставляет прежний черновик', async () => {
      // Иначе неудачная попытка затирала бы список, который человек
      // правил двадцать минут.
      await service.replaceTasks(writer(), projectId, summaryId, { tasks: [{ title: 'моё' }] });
      suggesterStub.suggest.mockRejectedValue(unavailable());

      await expect(service.suggest(writer(), projectId, summaryId)).rejects.toThrow();

      const detail = await service.findById(writer(), projectId, summaryId);

      expect(detail.tasks.map((task) => task.title)).toEqual(['моё']);
      expect(detail.suggester).toBeNull();
    });

    it('отказ отвечает 502: правильное действие клиента — повторить', async () => {
      suggesterStub.suggest.mockRejectedValue(unavailable());

      const error = await failureOf(service.suggest(writer(), projectId, summaryId));

      expect(error).toBeInstanceOf(BadGatewayException);
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        code: SUGGESTER_UNAVAILABLE,
      });
    });

    it('отказ пишется в журнал с кодом и длительностью, без чужого тела', async () => {
      suggesterStub.suggest.mockRejectedValue(unavailable('тело чужого ответа'));

      await expect(service.suggest(writer(), projectId, summaryId)).rejects.toThrow();

      const [record] = await auditRecords(AuditAction.SummaryTasksSuggestionFailed);

      expect(record?.metadata).toMatchObject({
        code: SUGGESTER_UNAVAILABLE,
        suggester: 'local',
        host: 'llm.internal',
      });
      expect(record?.metadata).toHaveProperty('durationMs');
      expect(JSON.stringify(record)).not.toContain('тело чужого ответа');
    });

    it('успех отдельной записи не получает', async () => {
      // Запись о передаче уже закрыта, дописать в неё число предложенных
      // нечем; последствие фиксирует `summary.released`.
      await service.suggest(writer(), projectId, summaryId);

      expect(await auditRecords(AuditAction.SummaryTasksSuggested)).toHaveLength(1);
      expect(await summaryActions()).toEqual([
        AuditAction.SummaryCreated,
        AuditAction.SummaryTasksSuggested,
      ]);
    });

    it('выключенный предложитель отвечает 409, а не 502', async () => {
      // Правильное действие клиента — «попросить администратора
      // включить», а не «повторить позже».
      const error = await failureOf(disabledService.suggest(writer(), projectId, summaryId));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: SUGGESTER_DISABLED,
      });
    });

    it('выключенный предложитель назван прежде длины текста', async () => {
      // Таблица дизайна 5.4 перечисляет «не настроен» первым, и это
      // верный порядок: человеку нечего сокращать, пока разбивки нет
      // вовсе, а «Сократите или разделите на два саммари» посылало бы
      // его делать работу, которая ничего не изменит.
      await seedLongText(50_000);

      const error = await failureOf(disabledService.suggest(writer(), projectId, summaryId));

      expect((error as ConflictException).getResponse()).toMatchObject({
        code: SUGGESTER_DISABLED,
      });
    });

    it('выключенный предложитель в журнал передачи не пишет', async () => {
      // Передачи не было — записи о ней быть не должно.
      await failureOf(disabledService.suggest(writer(), projectId, summaryId));

      expect(await auditRecords(AuditAction.SummaryTasksSuggested)).toHaveLength(0);
    });

    it('текст длиннее предела отказывает до вызова, с настоящим числом', async () => {
      await seedLongText(50_000);

      const error = await failureOf(service.suggest(writer(), projectId, summaryId));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: SUMMARY_TEXT_TOO_LONG,
        maxChars: 40_000,
      });
      expect(suggesterStub.suggest).not.toHaveBeenCalled();
      expect(await auditRecords(AuditAction.SummaryTasksSuggested)).toHaveLength(0);
    });

    it('второй одновременный вызов на субъекта отвергается', async () => {
      // Названная эксплуатационная граница: счётчик живёт в памяти
      // процесса и при нескольких репликах API перестаёт работать.
      const { promise, release } = deferred();
      suggesterStub.suggest.mockReturnValue(promise);

      const first = service.suggest(writer(), projectId, summaryId);

      await expect(service.suggest(writer(), projectId, summaryId)).rejects.toBeInstanceOf(
        ConflictException,
      );

      // Отказ отпускается только после того, как первый вызов правда
      // ушёл в порт: отвергнутый раньше, он не был бы никем подхвачен, и
      // Node посчитал бы его необработанным.
      await vi.waitFor(() => expect(suggesterStub.suggest).toHaveBeenCalled());
      release();
      await expect(first).rejects.toThrow();
    });

    it('место в счётчике освобождается после отказа', async () => {
      // Иначе первая же неудача запирала бы кнопку до перезапуска API.
      suggesterStub.suggest.mockRejectedValue(unavailable());
      await expect(service.suggest(writer(), projectId, summaryId)).rejects.toThrow();

      suggesterStub.suggest.mockResolvedValue({ tasks: [{ title: 'раз' }], dropped: 0 });

      await expect(service.suggest(writer(), projectId, summaryId)).resolves.toMatchObject({
        taskCount: 1,
      });
    });

    it('разбивка помнит момент текста', async () => {
      // По нему считается `isTextStale`.
      const [entry] = await testDb.rowsOf(chronicleEntries);

      await service.suggest(writer(), projectId, summaryId);

      const [row] = await testDb.rowsOf(summaries);

      expect(row?.suggestedTextAt).toEqual(entry?.updatedAt);
      expect((await service.findById(writer(), projectId, summaryId)).isTextStale).toBe(false);
    });
  });

  describe('прочие действия', () => {
    it('сохранение черновика в журнал не пишется', async () => {
      // Черновик — поверхность до подтверждения: десяток строк «правил
      // формулировку» на саммари сделал бы журнал нечитаемым.
      await service.replaceTasks(writer(), projectId, summaryId, { tasks: [{ title: 'моё' }] });

      expect(await summaryActions()).toEqual([AuditAction.SummaryCreated]);
    });

    it('удаление пишет в журнал заголовок', async () => {
      await service.remove(writer(), projectId, summaryId);

      const [record] = await auditRecords(AuditAction.SummaryDeleted);

      expect(record?.metadata).toEqual({ title: 'Созвон по релизу' });
      expect(await testDb.rowsOf(summaries)).toHaveLength(0);
    });


    it('запись созвона убирается после фиксации транзакции, а не внутри', async () => {
      // Порядок обязателен: сначала commit, потом unlink. Удаление файла
      // не откатывается, и обратный порядок унёс бы запись у саммари,
      // удаление которого потом откатилось.
      const jobId = await addJob(summaryId);

      await service.remove(writer(), projectId, summaryId);

      expect(store.removed).toEqual([`${jobId}.mp4`, `${jobId}.opus`]);
      expect(store.sawCommitted).toBe(true);
    });

    it('сбой удаления файла не валит удаление саммари', async () => {
      // Осиротевший файл виден предупреждением в логе, места занимает
      // столько же и данных не раскрывает. Откатывать удаление из-за него
      // значило бы сделать саммари неудаляемым из-за файла.
      await addJob(summaryId);
      store.failOnRemove = true;

      await expect(service.remove(writer(), projectId, summaryId)).resolves.toBeUndefined();
      expect(await testDb.rowsOf(summaries)).toHaveLength(0);
    });

    it('у саммари без созвона хранилище не зовётся вовсе', async () => {
      await service.remove(writer(), projectId, summaryId);

      expect(store.removed).toEqual([]);
    });

    it('уборка расшифровок своей записи в журнал не получает', async () => {
      // Человек удалял саммари, и журнал обязан описывать то, что он
      // сделал: вторая запись про файлы рассказывала бы о следствии.
      await addJob(summaryId);

      await service.remove(writer(), projectId, summaryId);

      expect(await summaryActions()).toEqual([
        AuditAction.SummaryCreated,
        AuditAction.SummaryDeleted,
      ]);
    });

    it('список и деталь отдаются службой без своих записей', async () => {
      expect(await service.list(writer(), projectId)).toHaveLength(1);
      expect((await service.findById(writer(), projectId, summaryId)).text).toBe('обсудили сроки');
      expect(await summaryActions()).toEqual([AuditAction.SummaryCreated]);
    });
  });
});
