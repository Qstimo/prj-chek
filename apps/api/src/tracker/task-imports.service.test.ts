import {
  SubjectKind,
  TrackerKind,
  type TrackerImportCandidate,
  type TrackerImportQuery,
} from '@cairn/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskPlanningRepository } from '../tasks/task-planning.repository';
import type { AuditService } from '../audit/audit.service';
import type { Database } from '../db/db.types';
import type { TaskExportsRepository } from './task-exports.repository';
import { existingImportTask, type TaskImportsRepository } from './task-imports.repository';
import { importBlock, matchesImport, TaskImportsService } from './task-imports.service';
import type { TrackerBindingsRepository } from './tracker-bindings.repository';
import type { Tracker, TrackerSource } from './tracker';

const task: TrackerImportCandidate = {
  externalId: '42',
  title: 'Оплата',
  externalUrl: 'https://app.weeek.net/ws/7/task/42',
  boardId: '11',
  boardColumnId: '31',
  isCompleted: false,
  existingTaskId: null,
  blockedReason: null,
  details: {
    projectId: '8',
    assignees: [{ id: 'user', name: 'Иван' }],
    author: null,
    createdAt: '2026-11-01T15:00:00Z',
    dueAt: '2026-11-25',
    startAt: null,
    completedAt: null,
  },
};
const filter: TrackerImportQuery = { boardId: '11', status: 'all', dateField: 'dueAt' };

describe('фильтры импорта', () => {
  it('применяет статус, колонку, исполнителя и поиск', () => {
    expect(matchesImport(task, { ...filter, status: 'completed' })).toBe(false);
    expect(matchesImport(task, { ...filter, columnId: '99' })).toBe(false);
    expect(matchesImport(task, { ...filter, assigneeId: 'unassigned' })).toBe(false);
    expect(matchesImport(task, { ...filter, assigneeId: 'other' })).toBe(false);
    expect(matchesImport(task, { ...filter, assigneeId: 'user', search: 'ОПЛ' })).toBe(true);
  });
  it('включает границы периода и исключает отсутствующую дату', () => {
    expect(matchesImport(task, { ...filter, dateFrom: '2026-11-25', dateTo: '2026-11-25' })).toBe(
      true,
    );
    expect(matchesImport(task, { ...filter, dateTo: '2026-11-24' })).toBe(false);
    expect(matchesImport(task, { ...filter, dateField: 'createdAt', dateTo: '2026-11-02' })).toBe(
      true,
    );
    expect(
      matchesImport(task, { ...filter, dateField: 'completedAt', dateFrom: '2026-11-01' }),
    ).toBe(false);
  });
  it('не обрезает длинные заголовки молча', () => {
    expect(importBlock('a'.repeat(301))).not.toBeNull();
    expect(importBlock('')).not.toBeNull();
    expect(importBlock('Оплата')).toBeNull();
  });
  it('считает ручную ссылку дублем только в том же пространстве', () => {
    const row = {
      taskId: 'local',
      url: 'https://app.weeek.net/ws/7/task/42',
      externalId: null,
      externalUrl: null,
    };
    expect(existingImportTask([row], task)).toBe('local');
    expect(
      existingImportTask([{ ...row, url: 'https://app.weeek.net/ws/99/task/42' }], task),
    ).toBeNull();
  });
});

describe('подтверждение импорта', () => {
  const subject = {
    id: 'user',
    kind: SubjectKind.User,
    label: 'User',
    isSuperadmin: false,
    isRevoked: false,
  };
  const requireWrite = vi.fn();
  const readImportTasks = vi.fn();
  const create = vi.fn();
  const known = vi.fn();
  const record = vi.fn();
  let service: TaskImportsService;
  const resolveVersion = vi.fn();
  const assign = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    resolveVersion.mockResolvedValue(null);
    readImportTasks.mockResolvedValue({
      tasks: [task],
      people: [],
      peopleAvailable: true,
      truncated: false,
    });
    known.mockImplementation(async () => []);
    create.mockResolvedValue({ id: 'local' });
    const db = {
      transaction: async (run: (tx: object) => unknown) => run({}),
    } as unknown as Database;
    service = new TaskImportsService(
      db,
      { known, create, lock: vi.fn() } as unknown as TaskImportsRepository,
      {
        requireWrite,
        findForProject: vi
          .fn()
          .mockResolvedValue({ externalProjectId: '8', boardId: '11', boardColumnId: '31' }),
      } as unknown as TrackerBindingsRepository,
      { recordExported: vi.fn(), recordPolled: vi.fn() } as unknown as TaskExportsRepository,
      { record } as unknown as AuditService,
      {
        current: async () =>
          ({ kind: TrackerKind.Weeek, isEnabled: true, readImportTasks }) as unknown as Tracker,
      } as TrackerSource,
      { resolveVersion, assign } as unknown as TaskPlanningRepository,
    );
  });
  it('проверяет право до внешнего вызова', async () => {
    requireWrite.mockRejectedValue(new Error('403'));
    await expect(service.preview(subject, 'project', filter)).rejects.toThrow('403');
    expect(readImportTasks).not.toHaveBeenCalled();
  });
  it('не читает задачи другой доски даже из того же пространства', async () => {
    await expect(
      service.preview(subject, 'project', { ...filter, boardId: 'other' }),
    ).rejects.toThrow('только с доски');
    expect(readImportTasks).not.toHaveBeenCalled();
  });
  it('ставит новые задачи в выбранный сервером релиз в той же транзакции', async () => {
    resolveVersion.mockResolvedValue('release');
    await service.import(subject, 'project', { boardId: '11', externalIds: ['42'] });
    expect(resolveVersion).toHaveBeenCalledWith(subject, expect.anything(), 'project', undefined);
    expect(assign).toHaveBeenCalledWith(subject, expect.anything(), 'project', 'local', {
      versionId: 'release',
    });
  });
  it('явное «вне релиза» не заменяется автоматическим выбором', async () => {
    await service.import(subject, 'project', {
      boardId: '11',
      externalIds: ['42'],
      versionId: null,
    });
    expect(resolveVersion).toHaveBeenCalledWith(subject, expect.anything(), 'project', null);
    expect(assign).not.toHaveBeenCalled();
  });
  it('перечитывает внешнюю задачу и создаёт её только из серверных данных', async () => {
    const results = await service.import(subject, 'project', {
      boardId: '11',
      externalIds: ['42'],
    });
    expect(readImportTasks).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      subject,
      expect.anything(),
      'project',
      expect.objectContaining({ title: 'Оплата', details: task.details }),
    );
    expect(results).toEqual([
      { externalId: '42', taskId: 'local', outcome: 'created', reason: null },
    ]);
    expect(record).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ action: 'task.imported' }),
    );
  });
  it('не создаёт повторно связанное и не создаёт исчезнувшее', async () => {
    known.mockResolvedValue([
      { taskId: 'local', url: task.externalUrl, externalId: '42', externalUrl: task.externalUrl },
    ]);
    const results = await service.import(subject, 'project', {
      boardId: '11',
      externalIds: ['42', '99'],
    });
    expect(results.map((result) => result.outcome)).toEqual(['existing', 'skipped']);
    expect(create).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
