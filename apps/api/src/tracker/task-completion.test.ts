import { describe, expect, it, vi } from 'vitest';
import { TrackerKind, AuditSubjectKind } from '@cairn/shared';
import { completionRuleMatches, applyTrackerCompletion } from './task-completion';
import type { TrackerTaskState } from './tracker';
import type { TaskExportPollTarget } from './task-exports.repository';
import type { Transaction } from '../db/db.types';
import type { AuditService } from '../audit/audit.service';

const state: TrackerTaskState = {
  externalId: '42',
  externalUrl: null,
  boardId: '11',
  boardColumnId: 'done',
  isCompleted: false,
};
const rule = { boardId: '11', columnId: 'done' };
const target: TaskExportPollTarget = {
  taskId: 'task',
  projectId: 'project',
  tracker: TrackerKind.Weeek,
  externalId: '42',
  externalProjectId: '7',
  boardId: '11',
  boardColumnId: 'start',
  checkedAt: null,
};

/** Последовательные ответы SQL; аудит и запись наблюдения остаются в вызывающей транзакции. */
function fixture({
  bindingBoard = '11',
  mirrorId = '42',
  completed = true,
  completionRule = rule as typeof rule | null,
} = {}) {
  const reads = [
    [{ id: 'project' }],
    [{ id: 'task', completionRule }],
    [{ boardId: bindingBoard, externalProjectId: '7' }],
    [{ externalId: mirrorId, externalBoardId: '11' }],
  ];
  const query = () => {
    const rows = reads.shift() ?? [];
    return {
      from: () => ({
        where: () => ({
          for: async () => rows,
          then: (resolve: (r: unknown) => unknown) => Promise.resolve(rows).then(resolve),
        }),
      }),
    };
  };
  const returning = vi
    .fn()
    .mockResolvedValue(completed ? [{ id: 'checkpoint', versionId: 'release' }] : []);
  const set = vi.fn(() => ({ where: () => ({ returning }) }));
  const update = vi.fn(() => ({ set }));
  return { tx: { select: query, update } as unknown as Transaction, update, set };
}

describe('автозавершение по колонке Weeek', () => {
  it('требует включённого правила и совпадения доски и колонки, не зависит от isCompleted', () => {
    expect(completionRuleMatches(rule, state, '11')).toBe(true);
    expect(completionRuleMatches(null, state, '11')).toBe(false);
    expect(completionRuleMatches(rule, null, '11')).toBe(false);
    expect(completionRuleMatches(rule, { ...state, boardId: 'other' }, '11')).toBe(false);
    expect(
      completionRuleMatches(rule, { ...state, boardColumnId: 'start', isCompleted: true }, '11'),
    ).toBe(false);
  });
  it('пишет завершение и системный аудит, повтор не добавляет запись в журнал', async () => {
    const { tx, set } = fixture();
    const record = vi.fn();
    await applyTrackerCompletion(tx, target, { tracker: TrackerKind.Weeek, state, code: null }, {
      record,
    } as unknown as AuditService);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ isDone: true }));
    expect(record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ kind: AuditSubjectKind.System, id: null }),
      expect.objectContaining({
        action: 'checkpoint.updated',
        metadata: expect.objectContaining({ source: 'weeek_completion_rule' }),
      }),
    );
    record.mockClear();
    await applyTrackerCompletion(
      fixture({ completed: false }).tx,
      target,
      { tracker: TrackerKind.Weeek, state, code: null },
      { record } as unknown as AuditService,
    );
    expect(record).not.toHaveBeenCalled();
  });
  it('не меняет размещение без правила, после смены доски или при устаревшем внешнем id', async () => {
    for (const options of [
      { completionRule: null },
      { bindingBoard: 'other' },
      { mirrorId: 'other' },
    ]) {
      const { tx, update } = fixture(options);
      await applyTrackerCompletion(
        tx,
        target,
        { tracker: TrackerKind.Weeek, state, code: null },
        {} as AuditService,
      );
      expect(update).not.toHaveBeenCalled();
    }
  });
  it('при отказе и пропуске задачи не делает ни одного SQL-запроса', async () => {
    await applyTrackerCompletion(
      {} as Transaction,
      target,
      { tracker: TrackerKind.Weeek, state, code: 'tracker_unavailable' },
      {} as AuditService,
    );
    await applyTrackerCompletion(
      {} as Transaction,
      target,
      { tracker: TrackerKind.Weeek, state: null, code: null },
      {} as AuditService,
    );
  });
});
