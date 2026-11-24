import { SubjectKind, TaskExportOutcome, TrackerKind, TRACKER_LINK_REQUIRED } from '@cairn/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import type { Database } from '../db/db.types';
import { TaskExportsRepository } from './task-exports.repository';
import { TaskExportsService } from './task-exports.service';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import type { Tracker, TrackerSource } from './tracker';

const subject = { id: 'subject', kind: SubjectKind.User, label: 'User', isSuperadmin: false, isRevoked: false };
const url = 'https://app.weeek.net/ws/4242/task/42';
const state = { externalId: '42', externalUrl: url, boardId: '11', boardColumnId: '32', isCompleted: true };

describe('связь с существующей задачей: порядок и отказы', () => {
  const requireWrite = vi.fn();
  const lockTarget = vi.fn();
  const readTaskLink = vi.fn();
  const recordExported = vi.fn();
  const recordPolled = vi.fn();
  const audit = vi.fn();
  const createTask = vi.fn();
  let service: TaskExportsService;

  beforeEach(() => {
    vi.resetAllMocks();
    const target = { taskId: 'task', title: 'Наша формулировка', url, export: null };
    lockTarget.mockResolvedValue(target);
    readTaskLink.mockResolvedValue(state);
    recordPolled.mockResolvedValue({ taskId: 'task', tracker: TrackerKind.Weeek,
      externalId: '42', externalUrl: url, externalBoardId: '11', externalColumnId: '32',
      isCompleted: true, exportedAt: new Date(), updatedAt: new Date(), checkedAt: new Date(), failureCode: null });
    const db = { transaction: async (run: (tx: object) => unknown) => run({}) } as unknown as Database;
    const bindings = { requireWrite, findForProject: vi.fn().mockResolvedValue({ tracker: TrackerKind.Weeek,
      externalProjectId: '7', boardId: '11', boardColumnId: '31' }) } as unknown as TrackerBindingsRepository;
    const exports = { lockTarget, recordExported, recordPolled,
      targetsOf: vi.fn().mockResolvedValue([target]) } as unknown as TaskExportsRepository;
    const tracker = { kind: TrackerKind.Weeek, isEnabled: true, readTaskLink, createTask } as unknown as Tracker;
    const source: TrackerSource = { current: async () => tracker };
    service = new TaskExportsService(db, db, exports, bindings, { record: audit } as unknown as AuditService, source);
  });

  it('читает существующую задачу, пишет связь и отдельное действие журнала', async () => {
    const result = await service.link(subject, 'project', 'task');
    expect(result.externalId).toBe('42');
    expect(result.isCompleted).toBe(true);
    expect(result.checkedAt).not.toBeNull();
    expect(readTaskLink).toHaveBeenCalledWith(url,
      { externalProjectId: '7', boardId: '11', boardColumnId: '31' }, expect.any(AbortSignal));
    expect(createTask).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.anything(),
      expect.objectContaining({ action: AuditAction.TaskTrackerLinked }));
  });

  it('отказ доступа происходит раньше чтения ссылки', async () => {
    requireWrite.mockRejectedValue(new Error('Нет права'));
    await expect(service.link(subject, 'project', 'task')).rejects.toThrow('Нет права');
    expect(readTaskLink).not.toHaveBeenCalled();
    expect(recordExported).not.toHaveBeenCalled();
  });

  it('не сохраняет связь и не раскрывает ошибку адаптера при отказе проверки', async () => {
    readTaskLink.mockRejectedValue(new Error('secret-token'));
    let error: Error | undefined;
    try { await service.link(subject, 'project', 'task'); } catch (cause) { error = cause as Error; }
    expect(error).toBeDefined();
    expect(error!.message).not.toContain('secret-token');
    expect(recordExported).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('повторное связывание с той же задачей не обращается в сеть', async () => {
    const mirror = { externalId: '42', externalUrl: url };
    lockTarget.mockResolvedValue({ taskId: 'task', url, export: mirror });
    expect(await service.link(subject, 'project', 'task')).toBe(mirror);
    expect(readTaskLink).not.toHaveBeenCalled();
  });

  it('другая ссылка не переписывает существующую связь', async () => {
    lockTarget.mockResolvedValue({ taskId: 'task', url,
      export: { externalId: '99', externalUrl: 'https://app.weeek.net/ws/4242/task/99' } });
    await expect(service.link(subject, 'project', 'task')).rejects.toThrow();
    expect(readTaskLink).not.toHaveBeenCalled();
    expect(recordExported).not.toHaveBeenCalled();
  });

  it('неполная ссылка не приводит к созданию дубля', async () => {
    lockTarget.mockResolvedValue({ taskId: 'task', url: 'https://app.weeek.net/ws/4242/board/11', export: null });
    const result = await service.export(subject, 'project', { taskIds: ['task'] });
    expect(result[0]?.failureCode).toBe(TRACKER_LINK_REQUIRED);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('обычная выгрузка ссылки Weeek не создаёт вторую задачу', async () => {
    const result = await service.export(subject, 'project', { taskIds: ['task'] });
    expect(result[0]).toMatchObject({ outcome: TaskExportOutcome.Failed, failureCode: TRACKER_LINK_REQUIRED });
    expect(createTask).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
