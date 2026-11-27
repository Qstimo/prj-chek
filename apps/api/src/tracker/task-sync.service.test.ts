import { SubjectKind, TRACKER_REJECTED, TRACKER_UNAVAILABLE, TrackerKind, type TrackerBinding } from '@cairn/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestSubject } from '../access/access.types';
import type { AuditService } from '../audit/audit.service';
import type { Database, Transaction } from '../db/db.types';
import { TaskSyncService } from './task-sync.service';
import type { TaskExportsService } from './task-exports.service';
import type {
  TaskExportPollTarget,
  TaskExportsRepository,
} from './task-exports.repository';
import type { TrackerBindingsRepository } from './tracker-bindings.repository';
import { TrackerFailure, type Tracker, type TrackerSource } from './tracker';

vi.mock('./task-completion', () => ({ applyTrackerCompletion: vi.fn() }));

const SUBJECT: RequestSubject = {
  id: 'subject',
  kind: SubjectKind.User,
  label: 'user@cairn.local',
  isSuperadmin: false,
  isRevoked: false,
};
const BINDING: TrackerBinding = {
  tracker: TrackerKind.Weeek,
  externalProjectId: '7',
  boardId: '11',
  boardColumnId: '31',
  completionColumnId: null,
  updatedAt: '2026-11-20T10:00:00.000Z',
  updatedByLabel: 'user@cairn.local',
};
const STATE = {
  externalId: '42',
  externalUrl: null,
  boardId: '11',
  boardColumnId: '31',
  isCompleted: false,
};

function targetOf(id: string, boardId = '11'): TaskExportPollTarget {
  return {
    taskId: id,
    projectId: 'project',
    tracker: TrackerKind.Weeek,
    externalId: id,
    externalProjectId: '7',
    boardId,
    boardColumnId: '31',
    checkedAt: null,
  };
}

function fixture({
  targets = [targetOf('task')],
  binding = BINDING as TrackerBinding | null,
  enabled = true,
  states = [STATE],
  fail = false,
} = {}) {
  const tx = {} as Transaction;
  const bindings = {
    requireWrite: vi.fn(),
    findForProject: vi.fn().mockResolvedValue(binding),
  };
  const exports = {
    listForProject: vi.fn().mockResolvedValue(targets),
    recordPolled: vi.fn().mockResolvedValue({}),
  };
  const audit = { record: vi.fn() } as unknown as AuditService;
  const port = {
    kind: TrackerKind.Weeek,
    host: 'api.weeek.net',
    isEnabled: enabled,
    readTasks: vi.fn().mockImplementation(async () => {
      if (fail) throw new TrackerFailure(TRACKER_REJECTED, 'отказ трекера');
      return states;
    }),
  } as unknown as Tracker;
  const trackers = { current: vi.fn().mockResolvedValue(port) } as unknown as TrackerSource;
  const taskExports = { linkUnlinkedForProject: vi.fn().mockResolvedValue(null) };
  const db = {
    transaction: vi.fn(async (run: (value: Transaction) => unknown) => run(tx)),
  } as unknown as Database;
  const service = new TaskSyncService(
    db,
    exports as unknown as TaskExportsRepository,
    bindings as unknown as TrackerBindingsRepository,
    audit,
    trackers,
    taskExports as unknown as TaskExportsService,
  );

  return { service, bindings, exports, port, trackers, db, tx, taskExports };
}

describe('общая синхронизация задач проекта', () => {
  it('автосвязка завершается до выбора зеркал и опроса новой задачи', async () => {
    const { service, taskExports, exports, port } = fixture({ targets: [] });
    taskExports.linkUnlinkedForProject.mockImplementation(async () => {
      exports.listForProject.mockResolvedValue([targetOf(STATE.externalId)]);
      return null;
    });

    await expect(service.sync(SUBJECT, 'project')).resolves.toEqual({
      checked: 1, found: 1, failureCode: null,
    });
    expect(taskExports.linkUnlinkedForProject).toHaveBeenCalledWith(SUBJECT, 'project');
    expect(taskExports.linkUnlinkedForProject.mock.invocationCallOrder[0])
      .toBeLessThan(exports.listForProject.mock.invocationCallOrder[0]!);
    expect(exports.listForProject.mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(port.readTasks).mock.invocationCallOrder[0]!);
  });

  it('отказ автосвязки не прерывает опрос существующих зеркал', async () => {
    const { service, taskExports, port } = fixture();
    taskExports.linkUnlinkedForProject.mockResolvedValue(TRACKER_UNAVAILABLE);

    await expect(service.sync(SUBJECT, 'project')).resolves.toEqual({
      checked: 1, found: 0, failureCode: TRACKER_UNAVAILABLE,
    });
    expect(port.readTasks).toHaveBeenCalledTimes(1);
  });

  it('сохраняет первый отказ автосвязки, но пишет в зеркало код отказа опроса', async () => {
    const { service, taskExports, exports } = fixture({ fail: true });
    taskExports.linkUnlinkedForProject.mockResolvedValue(TRACKER_UNAVAILABLE);

    expect((await service.sync(SUBJECT, 'project')).failureCode).toBe(TRACKER_UNAVAILABLE);
    expect(exports.recordPolled).toHaveBeenCalledWith(
      expect.anything(), 'task', expect.objectContaining({ code: TRACKER_REJECTED }),
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('требует запись на роадмап и привязку доски до обращения в сеть', async () => {
    const { service, bindings, trackers } = fixture({ binding: null });

    await expect(service.sync(SUBJECT, 'project')).rejects.toThrow();
    expect(bindings.requireWrite).toHaveBeenCalledWith(SUBJECT, 'project');
    expect(trackers.current).not.toHaveBeenCalled();
  });

  it('не обращается в трекер без подключения', async () => {
    const { service, port, exports } = fixture({ enabled: false });

    await expect(service.sync(SUBJECT, 'project')).rejects.toThrow();
    expect(port.readTasks).not.toHaveBeenCalled();
    expect(exports.listForProject).not.toHaveBeenCalled();
  });

  it('спрашивает каждую доску один раз и пишет найденные статусы', async () => {
    const first = { ...targetOf('first', '11'), externalId: STATE.externalId };
    const second = targetOf('second', '11');
    const other = targetOf('third', '12');
    const { service, port, exports, db } = fixture({
      targets: [first, second, other],
      states: [STATE],
    });

    const result = await service.sync(SUBJECT, 'project');

    expect(port.readTasks).toHaveBeenCalledTimes(2);
    expect(db.transaction).toHaveBeenCalledTimes(3);
    expect(exports.recordPolled).toHaveBeenCalledTimes(3);
    expect(exports.recordPolled).toHaveBeenCalledWith(
      expect.anything(), 'first', { tracker: TrackerKind.Weeek, state: STATE, code: null },
    );
    expect(result).toEqual({ checked: 3, found: 1, failureCode: null });
  });

  it('на отказе обмена пишет код всем задачам доски и останавливает синхронизацию', async () => {
    const { service, exports, port } = fixture({
      targets: [targetOf('first'), targetOf('second', '12')],
      fail: true,
    });

    const result = await service.sync(SUBJECT, 'project');

    expect(port.readTasks).toHaveBeenCalledTimes(1);
    expect(exports.recordPolled).toHaveBeenCalledTimes(1);
    expect(exports.recordPolled).toHaveBeenCalledWith(
      expect.anything(),
      'first',
      expect.objectContaining({ code: TRACKER_REJECTED, state: null }),
    );
    expect(result).toEqual({ checked: 1, found: 0, failureCode: TRACKER_REJECTED });
  });

  it('без связанных задач не задаёт ни одного вопроса', async () => {
    const { service, port } = fixture({ targets: [] });

    await expect(service.sync(SUBJECT, 'project')).resolves.toEqual({
      checked: 0,
      found: 0,
      failureCode: null,
    });
    expect(port.readTasks).not.toHaveBeenCalled();
  });
});
