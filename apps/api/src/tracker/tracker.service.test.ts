import { randomBytes } from 'node:crypto';

import {
  AccessLevel,
  ModelProbeOutcome,
  Section,
  SubjectKind,
  TRACKER_BASE_URL_MISSING,
  TRACKER_DISABLED,
  TRACKER_NOT_CONFIGURED,
  TRACKER_SECRET_MISSING,
  TaskOrigin,
  TrackerKind,
  type TrackerConnectionUpdate,
  type TrackerProbeResult,
} from '@cairn/shared';
import { asc } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { CryptoService } from '../crypto/crypto.service';
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
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import { TrackerConnectionService } from './tracker-connection.service';
import { TrackerConnectionsRepository } from './tracker-connections.repository';
import type { Tracker, TrackerSource } from './tracker';
import { TrackerService } from './tracker.service';
import { TrackerConnectionSource } from './tracker.source';

/** Токен, которого не должно быть ни в одном ответе и ни в одной записи. */
const TOKEN = 'weeek-token-ОЧЕНЬ-СЕКРЕТНЫЙ';

/** Полная настройка подключения: каждая проверка меняет в ней одно поле. */
const INPUT: TrackerConnectionUpdate = {
  baseUrl: 'https://api.weeek.net/public/v1',
  workspaceId: '4242',
  isEnabled: true,
};

/** Исход, который отдаёт заглушка порта: в сеть не ходит ни один тест. */
const PROBE: TrackerProbeResult = {
  outcome: ModelProbeOutcome.Unauthorized,
  status: 401,
  host: 'api.weeek.net',
  durationMs: 12,
};

describe('TrackerService', () => {
  let testDb: TestDatabase;
  let connections: TrackerConnectionService;
  let service: TrackerService;
  let admin: RequestSubject;
  let member: RequestSubject;
  let projectId: string;
  let adminUserId: string;

  const probe = vi.fn<Tracker['probe']>();
  const targets = vi.fn<Tracker['targets']>();

  /**
   * Источник заглушки: адаптер строится по настройке, а не по токену.
   *
   * Поля читаются из разрешённой настройки — так тест видит, что служба
   * действительно спросила базу, а не сходила к порту, построенному раньше.
   */
  const source: TrackerSource = {
    current: async () => {
      const resolved = await connections.resolve(TrackerKind.Weeek);

      return {
        kind: TrackerKind.Weeek,
        host: resolved.host,
        isEnabled: resolved.isOperational,
        createTask: vi.fn(),
        updateTask: vi.fn(),
        readTasks: vi.fn(),
            readImportTasks: vi.fn(),
            readTaskLink: vi.fn(),
        targets,
        probe,
      };
    },
  };

  /** Записи журнала, старые сверху. */
  async function auditRows() {
    return testDb.db.select().from(auditLog).orderBy(asc(auditLog.createdAt));
  }

  /** Метаданные записи по действию: ищется по действию, а не по месту. */
  async function metadataOf(action: AuditAction): Promise<unknown> {
    const rows = await auditRows();

    return rows.find((row) => row.action === action)?.metadata;
  }

  /** Выдача подрядчику на «Роадмап» нужного уровня. */
  async function grantLevel(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: member.id,
      projectId,
      section: Section.Roadmap,
      level,
      grantedBy: adminUserId,
    });
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const repository = new TrackerConnectionsRepository(
      testDb.db,
      new CryptoService(randomBytes(32).toString('base64')),
    );
    connections = new TrackerConnectionService(testDb.db, repository);
    service = new TrackerService(
      testDb.db,
      repository,
      new TrackerBindingsRepository(testDb.db, new AccessService(testDb.db)),
      new TaskExportsRepository(testDb.db, new AccessService(testDb.db)),
      connections,
      new AuditService(),
      source,
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
    probe.mockReset();
    probe.mockResolvedValue(PROBE);
    targets.mockReset();
    targets.mockResolvedValue({ projects: [], boards: [], columns: [] });

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ@cairn.local' })
      .returning();
    const [adminUser] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'админ@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = adminUser!.id;
    admin = {
      id: adminSubject!.id,
      kind: SubjectKind.User,
      label: 'админ@cairn.local',
      isSuperadmin: true,
      isRevoked: false,
    };

    const [memberSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик@cairn.local' })
      .returning();
    await testDb.db
      .insert(users)
      .values({ subjectId: memberSubject!.id, email: 'подрядчик@cairn.local', passwordHash: 'хэш' });
    member = {
      id: memberSubject!.id,
      kind: SubjectKind.User,
      label: 'подрядчик@cairn.local',
      isSuperadmin: false,
      isRevoked: false,
    };

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  describe('настройка подключения', () => {
    it('ненастроенное подключение отдаётся пустым адресом и названной причиной', async () => {
      // Поля «источник настройки» у трекера нет: запасного источника в
      // окружении не бывает (дизайн, 3.4), и единственный ответ на вопрос
      // «откуда настройка» — база.
      const found = await service.find(TrackerKind.Weeek);

      expect(found).toMatchObject({
        baseUrl: '',
        hasSecret: false,
        isOperational: false,
        blockedBy: TRACKER_BASE_URL_MISSING,
      });
    });

    it('без токена подключение не работает: та же лестница, что у портов модели', async () => {
      await service.save(admin, TrackerKind.Weeek, INPUT);

      expect(await service.find(TrackerKind.Weeek)).toMatchObject({
        isOperational: false,
        blockedBy: TRACKER_SECRET_MISSING,
      });
    });

    it('снятая галочка называется отдельно от неполноты', async () => {
      await service.save(admin, TrackerKind.Weeek, {
        ...INPUT,
        isEnabled: false,
        secret: TOKEN,
      });

      expect(await service.find(TrackerKind.Weeek)).toMatchObject({
        isOperational: false,
        blockedBy: TRACKER_DISABLED,
      });
    });

    it('ответ не содержит токена ни под каким именем', async () => {
      const saved = await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });

      // Сравнение целиком, а не поиск отсутствия подстроки: токен уехал бы
      // и под именем `secretTail`, и внутри вложенного объекта.
      expect(JSON.stringify(saved)).not.toContain(TOKEN);
      expect(Object.keys(saved).filter((key) => /secret/i.test(key))).toEqual(['hasSecret']);
      expect(saved).toMatchObject({ hasSecret: true, isOperational: true });
    });

    it('замыкающая косая снимается прежде записи', async () => {
      // Иначе адаптер соберёт путь с двойной косой: он дописывает
      // `/tm/tasks` сам.
      const saved = await service.save(admin, TrackerKind.Weeek, {
        ...INPUT,
        baseUrl: 'https://api.weeek.net/public/v1/',
      });

      expect(saved.baseUrl).toBe('https://api.weeek.net/public/v1');
    });

    it('правка полей пишет одну запись с именами полей, но не значениями', async () => {
      await service.save(admin, TrackerKind.Weeek, INPUT);

      const rows = await auditRows();

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: AuditAction.TrackerConnectionUpdated,
        entityType: 'tracker_connection',
        // Идентификатор строки и есть значение перечня: он первичный ключ.
        entityId: TrackerKind.Weeek,
        // Подключение межпроектно и ни одному проекту не принадлежит.
        projectId: null,
      });
      expect(await metadataOf(AuditAction.TrackerConnectionUpdated)).toEqual({
        host: 'api.weeek.net',
        workspaceId: '4242',
        isEnabled: true,
        fields: ['baseUrl', 'workspaceId', 'isEnabled'],
        action: 'saved',
      });
    });

    it('правка полей и токена одним запросом пишет две записи', async () => {
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });

      expect((await auditRows()).map((row) => row.action).sort()).toEqual([
        AuditAction.TrackerConnectionUpdated,
        AuditAction.TrackerSecretSet,
      ]);
    });

    it('правка без поля токена второй записи не пишет', async () => {
      // Отсутствие поля означает «не менять», и запись «изменён токен» о
      // неменянном токене была бы неправдой в неизменяемом журнале.
      await service.save(admin, TrackerKind.Weeek, INPUT);

      expect((await auditRows()).map((row) => row.action)).toEqual([
        AuditAction.TrackerConnectionUpdated,
      ]);
    });

    it('токен не попадает в журнал ни одним полем', async () => {
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });

      expect(JSON.stringify(await auditRows())).not.toContain(TOKEN);
      expect(await metadataOf(AuditAction.TrackerSecretSet)).toEqual({
        host: 'api.weeek.net',
        action: 'set',
      });
    });

    it('убранный токен отличается в журнале от поставленного', async () => {
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: null });

      expect(await metadataOf(AuditAction.TrackerSecretSet)).toEqual({
        host: 'api.weeek.net',
        action: 'cleared',
      });
    });

    it('снятие подключения — та же запись с другим действием', async () => {
      // Четыре действия трекера, а не пять (дизайн, 7): снятие — это
      // правка подключения, и отличается она значением `action`, а не
      // новым именем в перечне журнала.
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });
      await service.clear(admin, TrackerKind.Weeek);

      expect((await auditRows()).at(-1)).toMatchObject({
        action: AuditAction.TrackerConnectionUpdated,
        entityId: TrackerKind.Weeek,
        // «Что было» читается прежде удаления строки: после него назвать
        // прежний узел нечем.
        metadata: { host: 'api.weeek.net', action: 'cleared' },
      });
      expect(await service.find(TrackerKind.Weeek)).toMatchObject({ baseUrl: '' });
    });

    it('снятие подключения уносит привязки и зеркала выгрузок', async () => {
      // Дизайн 3.3 обещает это одним `DELETE`, и предупреждение на экране
      // обещает это человеку словами. Без шага обещание переворачивается:
      // строка выгрузки означает «задача в трекере есть», и после смены
      // токена на чужое пространство повторная выгрузка пошла бы
      // `PUT /tm/tasks/{id}` по идентификатору, который там принадлежит
      // чужой задаче, — то есть переписала бы чужую формулировку молча.
      // Привязка уносится по той же причине, но ценой мягче: доска мёртвого
      // пространства дала бы названный отказ, зато панель до него говорила
      // бы «доска выбрана, задачи уедут в неё» — утверждение, которое уже
      // неверно.
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });
      await grantLevel(AccessLevel.Write);
      await service.saveBinding(member, projectId, {
        externalProjectId: '7',
        boardId: '11',
        boardColumnId: '31',
      });

      const [task] = await testDb.db
        .insert(projectTasks)
        .values({ projectId, title: 'Оплата картой', origin: TaskOrigin.Manual })
        .returning();
      await testDb.db.insert(taskExports).values({
        taskId: task!.id,
        tracker: TrackerKind.Weeek,
        externalId: '4096',
        externalBoardId: '11',
      });

      await service.clear(admin, TrackerKind.Weeek);

      expect(await testDb.rowsOf(taskExports)).toHaveLength(0);
      expect(await testDb.rowsOf(trackerProjectBindings)).toHaveLength(0);
      // Задачи проектов остаются: трекер — не владелец реестра, и снятие
      // настройки установки не вправе стирать содержимое проектов.
      expect(await testDb.rowsOf(projectTasks)).toHaveLength(1);
    });

    it('снятие отсутствующей строки не падает и не пишет в журнал', async () => {
      await expect(service.clear(admin, TrackerKind.Weeek)).resolves.not.toThrow();

      expect(await auditRows()).toHaveLength(0);
    });
  });

  describe('проверка связи', () => {
    it('ненастроенное подключение отказывает и в сеть не идёт', async () => {
      await expect(service.probe(admin, TrackerKind.Weeek)).rejects.toMatchObject({
        response: { code: TRACKER_NOT_CONFIGURED },
      });

      expect(probe).not.toHaveBeenCalled();
      expect(await auditRows()).toHaveLength(0);
    });

    it('исход возвращается как есть и журналируется после вызова', async () => {
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });

      const result = await service.probe(admin, TrackerKind.Weeek);

      expect(result).toEqual(PROBE);
      expect(probe).toHaveBeenCalledOnce();
      expect((await auditRows()).at(-1)).toMatchObject({
        action: AuditAction.TrackerProbed,
        entityType: 'tracker_connection',
        entityId: TrackerKind.Weeek,
      });
      expect(await metadataOf(AuditAction.TrackerProbed)).toEqual({
        host: 'api.weeek.net',
        outcome: ModelProbeOutcome.Unauthorized,
        status: 401,
        durationMs: 12,
      });
    });
  });

  describe('привязка проекта', () => {
    const binding = { externalProjectId: '7', boardId: '11', boardColumnId: '31' };

    it('без выдачи на «Роадмап» проект не раскрывается вовсе', async () => {
      await expect(service.saveBinding(member, projectId, binding)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('чтения мало: привязка — правка настройки проекта', async () => {
      await grantLevel(AccessLevel.Read);

      await expect(service.saveBinding(member, projectId, binding)).rejects.toBeInstanceOf(
        InsufficientLevelError,
      );
    });

    it('запись ставит привязку и пишет своё действие журнала', async () => {
      await grantLevel(AccessLevel.Write);

      const saved = await service.saveBinding(member, projectId, binding);

      expect(saved).toMatchObject({
        tracker: TrackerKind.Weeek,
        externalProjectId: '7',
        boardId: '11',
        boardColumnId: '31',
        updatedByLabel: 'подрядчик@cairn.local',
      });
      expect((await auditRows()).at(-1)).toMatchObject({
        action: AuditAction.TrackerBindingSet,
        entityType: 'tracker_binding',
        entityId: projectId,
        // Привязка принадлежит проекту, в отличие от подключения.
        projectId,
      });
      expect(await metadataOf(AuditAction.TrackerBindingSet)).toEqual({
        tracker: TrackerKind.Weeek,
        externalProjectId: '7',
        boardId: '11',
        boardColumnId: '31',
      });
    });

    it('вторая правка переписывает привязку, а не заводит вторую', async () => {
      await grantLevel(AccessLevel.Write);
      await service.saveBinding(member, projectId, binding);

      const saved = await service.saveBinding(member, projectId, { ...binding, boardColumnId: '32' });

      expect(saved.boardColumnId).toBe('32');
      expect((await service.findForProject(member, projectId)).binding?.boardColumnId).toBe('32');
    });

    it('проектная проекция называет готовность трекера, но не его адрес', async () => {
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });
      await grantLevel(AccessLevel.Read);

      const found = await service.findForProject(member, projectId);

      expect(found).toEqual({ isOperational: true, blockedBy: null, binding: null });
      expect(JSON.stringify(found)).not.toContain('api.weeek.net');
    });
  });

  describe('источник порта', () => {
    it('без токена отдаёт выключенный порт', async () => {
      // Та же лестница, что у предложителя задач и расшифровки: без ключа
      // порт выключен, установка остаётся рабочей, только без выгрузки.
      await service.save(admin, TrackerKind.Weeek, INPUT);

      expect((await new TrackerConnectionSource(connections).current()).isEnabled).toBe(false);
    });

    it('правка настройки действует без перезапуска: адаптер строится на вызов', async () => {
      // Прежде адаптер строился при старте, и снятый токен продолжал
      // работать до перезапуска API. Проверяется именно это: два вызова
      // одного источника дают разные порты по разной настройке.
      const source = new TrackerConnectionSource(connections);

      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });
      const live = await source.current();

      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: null });
      const dead = await source.current();

      expect([live.isEnabled, live.host]).toEqual([true, 'api.weeek.net']);
      expect([dead.isEnabled, dead.host]).toEqual([false, null]);
    });
  });

  describe('списки для привязки', () => {
    it('без подключения отказывает кодом «трекер не настроен» и в сеть не идёт', async () => {
      await grantLevel(AccessLevel.Write);

      await expect(service.targets(member, projectId)).rejects.toMatchObject({
        response: { code: TRACKER_NOT_CONFIGURED },
      });

      expect(targets).not.toHaveBeenCalled();
    });

    it('право проверяется прежде обращения к трекеру', async () => {
      // Порядок значим: сходив в трекер прежде проверки, ручка позволила
      // бы кому угодно дёргать чужой API нашим токеном.
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });

      await expect(service.targets(member, projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
      expect(targets).not.toHaveBeenCalled();

      await grantLevel(AccessLevel.Read);
      await expect(service.targets(member, projectId)).rejects.toBeInstanceOf(
        InsufficientLevelError,
      );
      expect(targets).not.toHaveBeenCalled();
    });

    it('с записью и подключением списки отдаются как есть', async () => {
      await service.save(admin, TrackerKind.Weeek, { ...INPUT, secret: TOKEN });
      await grantLevel(AccessLevel.Write);
      targets.mockResolvedValue({
        projects: [{ id: '7', name: 'CAIRN' }],
        boards: [{ id: '11', name: 'Разработка', projectId: '7' }],
        columns: [{ id: '31', name: 'Бэклог', boardId: '11' }],
      });

      const result = await service.targets(member, projectId);

      expect(result.projects).toEqual([{ id: '7', name: 'CAIRN' }]);
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });
  });
});
