import {
  AccessLevel,
  Section,
  PlatformKind,
  SUMMARY_TASKS_EMPTY,
  SUGGESTER_DISABLED,
  SUMMARY_ALREADY_RELEASED,
  SUGGESTER_UNAVAILABLE,
  SUMMARY_TEXT_NOT_PLAIN,
  SUMMARY_TEXT_TOO_LONG,
  SubjectKind,
  SummaryTaskOrigin,
  TaskSuggesterKind,
  type SummaryCreate,
} from '@cairn/shared';
import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';
import { asc, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
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
  users,
} from '../db/schema';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { DisabledSuggester } from './suggester/disabled.suggester';
import { SuggesterFailure, type TaskSuggester } from './suggester/task-suggester';
import { SummariesRepository } from './summaries.repository';
import { SummariesService } from './summaries.service';
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

/** Обещание, которое разрешает тест: так ловится «вызов ещё в сети». */
function deferred(): { promise: Promise<never>; release: () => void } {
  let release = (): void => {};
  const promise = new Promise<never>((_resolve, reject) => {
    release = () => reject(unavailable('прервано тестом'));
  });

  return { promise, release };
}

describe('служба саммари', () => {
  let testDb: TestDatabase;
  let service: SummariesService;
  let disabledService: SummariesService;
  let repository: SummariesRepository;
  let audit: AuditService;
  let projectId: string;
  let adminSubjectId: string;
  let summaryId: string;

  /** Заглушка порта: ни один тест не ходит в сеть. */
  const suggesterStub: TaskSuggester & { suggest: ReturnType<typeof vi.fn> } = {
    kind: TaskSuggesterKind.Local,
    model: 'тестовая',
    host: 'llm.internal',
    maxChars: 40_000,
    isEnabled: true,
    suggest: vi.fn(),
  };

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
    service = new SummariesService(testDb.db, repository, audit, suggesterStub, new RoadmapRepository(testDb.db, access));
    // Вторая служба на выключенном порте: адаптер выбирается при старте,
    // и подменять его на ходу нельзя — так же, как в боевом коде.
    disabledService = new SummariesService(
      testDb.db,
      repository,
      audit,
      new DisabledSuggester(),
      new RoadmapRepository(testDb.db, access),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
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

  describe('формирование релиза', () => {
    beforeEach(async () => {
      await service.suggest(writer(), projectId, summaryId);
      const detail = await service.findById(writer(), projectId, summaryId);
      await service.replaceTasks(writer(), projectId, summaryId, {
        tasks: [...detail.tasks.map(({ id, title }) => ({ id, title })), { title: 'три' }],
      });
    });

    it('создаёт версию, упорядоченные незакрытые чекпоинты и полный журнал', async () => {
      const result = await service.release(writer(), projectId, summaryId, { label: 'v1.3' });
      expect(result).toEqual({ versionId: expect.any(String), label: 'v1.3', checkpointCount: 3 });
      const rows = await testDb.db.select().from(roadmapCheckpoints).orderBy(asc(roadmapCheckpoints.position));
      expect(rows.map(({ position, title, isDone, url }) => [position, title, isDone, url])).toEqual([
        [1, 'раз', false, null], [2, 'два', false, null], [3, 'три', false, null],
      ]);
      expect(await testDb.db.select().from(checkpointPlatforms)).toEqual([]);
      expect((await testDb.db.select().from(summaries))[0]?.releasedVersionId).toBe(result.versionId);
      expect((await auditRecords(AuditAction.SummaryReleased))[0]?.metadata).toEqual({ label: 'v1.3', tasks: 3, fromModel: 2 });
      expect(await auditRecords(AuditAction.RoadmapVersionCreated)).toHaveLength(1);
      expect((await auditRecords(AuditAction.CheckpointCreated)).map(row => row.metadata)).toEqual([
        { title: 'раз' }, { title: 'два' }, { title: 'три' },
      ]);
    });

    it('повторный релиз — 409 с кодом', async () => {
      await service.release(writer(), projectId, summaryId, { label: 'v1.3' });
      await expect(service.release(writer(), projectId, summaryId, { label: 'v1.4' })).rejects.toMatchObject({
        status: 409, response: expect.objectContaining({ code: SUMMARY_ALREADY_RELEASED }),
      });
    });

    it('пустой черновик — 409 с кодом', async () => {
      await service.replaceTasks(writer(), projectId, summaryId, { tasks: [] });
      await expect(service.release(writer(), projectId, summaryId, { label: 'v1.3' })).rejects.toMatchObject({
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
      await expect(service.release(writer(), projectId, summaryId, { label: 'v1.3' })).rejects.toThrow('второй чекпоинт');
      expect(await testDb.db.select().from(roadmapVersions)).toEqual([]);
      expect(await testDb.db.select().from(roadmapCheckpoints)).toEqual([]);
      expect(await auditRecords(AuditAction.RoadmapVersionCreated)).toEqual([]);
      expect(await auditRecords(AuditAction.CheckpointCreated)).toEqual([]);
      expect(await auditRecords(AuditAction.SummaryReleased)).toEqual([]);
      expect((await testDb.db.select().from(summaries))[0]?.releasedVersionId).toBeNull();
    });

    it('одновременные нажатия дают одну версию и один конфликт', async () => {
      const results = await Promise.allSettled(['v1.3', 'v1.4'].map(label => service.release(writer(), projectId, summaryId, { label })));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, response: expect.objectContaining({ code: SUMMARY_ALREADY_RELEASED }) } });
      expect(await testDb.db.select().from(roadmapVersions)).toHaveLength(1);
    });

    it.each(['ручная', 'предложенная'])('замена %s после чтения до релиза получает конфликт и не меняет выпущенный черновик', async (kind) => {
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
        await service.release(writer(), projectId, summaryId, { label: 'v1.3' });
      } finally {
        resumeWrite();
      }
      expect(await outcome).toBeInstanceOf(ConflictException);
      const detail = await service.findById(writer(), projectId, summaryId);
      const checkpoints = await testDb.db.select().from(roadmapCheckpoints).orderBy(asc(roadmapCheckpoints.position));
      expect(detail.tasks.map(task => task.title)).toEqual(checkpoints.map(checkpoint => checkpoint.title));
      expect(detail.tasks.map(task => task.title)).toEqual(['раз', 'два', 'три']);
    });

    it('занятое обозначение отвергает репозиторий роадмапа', async () => {
      await testDb.db.insert(roadmapVersions).values({ projectId, label: 'v1.3', position: 1 });
      await expect(service.release(writer(), projectId, summaryId, { label: 'v1.3' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('releasedDate при платформе отвергает репозиторий роадмапа', async () => {
      await testDb.db.insert(projectPlatforms).values({ projectId, name: 'Веб', kind: PlatformKind.Server, position: 1 });
      await expect(service.release(writer(), projectId, summaryId, { label: 'v1.3', releasedDate: null })).rejects.toBeInstanceOf(ConflictException);
    });

    it('устаревший текст не блокирует релиз', async () => {
      await testDb.db.update(chronicleEntries).set({ updatedAt: new Date(Date.now() + 60_000) });
      expect((await service.findById(writer(), projectId, summaryId)).isTextStale).toBe(true);
      await expect(service.release(writer(), projectId, summaryId, { label: 'v1.3' })).resolves.toBeDefined();
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
      await expect(service.release({ ...writer(), id: member!.id, isSuperadmin: false }, projectId, summaryId, { label: 'v1.3' })).rejects.toMatchObject({ status });
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
        text: '﻿обсудили сроки',
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

    it('по сформированному релизу разбивка не повторяется, и до сети не доходит', async () => {
      // Черновик после релиза не правится (`SUMMARY_ALREADY_RELEASED`), и
      // узнать об этом после того, как текст ушёл наружу и был оплачен,
      // поздно.
      const [version] = await testDb.db
        .insert(roadmapVersions)
        .values({ projectId, label: 'v1.3', position: 1 })
        .returning();
      await testDb.db.update(summaries).set({ releasedVersionId: version!.id });

      const error = await failureOf(service.suggest(writer(), projectId, summaryId));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: SUMMARY_ALREADY_RELEASED,
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

    it('список и деталь отдаются службой без своих записей', async () => {
      expect(await service.list(writer(), projectId)).toHaveLength(1);
      expect((await service.findById(writer(), projectId, summaryId)).text).toBe('обсудили сроки');
      expect(await summaryActions()).toEqual([AuditAction.SummaryCreated]);
    });
  });
});
