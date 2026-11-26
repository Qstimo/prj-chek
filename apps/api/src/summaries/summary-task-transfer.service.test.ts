import { SubjectKind, TaskOrigin, SummaryTaskState } from '@cairn/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/db.types';
import type { RequestSubject } from '../access/access.types';
import type { AuditService } from '../audit/audit.service';
import type { TasksRepository } from '../tasks/tasks.repository';
import type { SummariesRepository } from './summaries.repository';
import { SummaryTaskTransferService } from './summary-task-transfer.service';

const subject: RequestSubject = {
  id: 'subject',
  kind: SubjectKind.User,
  label: 'User',
  isSuperadmin: false,
  isRevoked: false,
};
const draft = {
  id: 'draft',
  taskId: null,
  title: 'Оплата',
  url: 'https://example.com/task',
  platformIds: ['platform'],
  state: SummaryTaskState.Active,
};
function fixture() {
  const tx = {};
  const transaction = vi.fn(async (fn: (tx: object) => unknown) => fn(tx));
  const selected = vi.fn().mockResolvedValue([draft]);
  const mark = vi.fn();
  const create = vi.fn().mockResolvedValue({ id: 'task', origin: TaskOrigin.Summary });
  const record = vi.fn();
  const service = new SummaryTaskTransferService(
    { transaction } as unknown as Database,
    { tasksForTransfer: selected, markTransferred: mark } as unknown as SummariesRepository,
    { createFromSummary: create } as unknown as TasksRepository,
    { record } as unknown as AuditService,
  );
  return { service, selected, create, record, mark, tx };
}
describe('перенос выбранных строк саммари в реестр задач', () => {
  it('переносит сохранённые поля и связывает именно выбранный черновик с новой задачей', async () => {
    const f = fixture();
    expect(await f.service.transfer(subject, 'project', 'summary', { taskIds: ['draft'] })).toEqual(
      { taskIds: ['task'] },
    );
    expect(f.selected).toHaveBeenCalledWith(subject, f.tx, 'project', 'summary', ['draft']);
    expect(f.create).toHaveBeenCalledWith(subject, f.tx, 'project', 'summary', {
      title: draft.title,
      url: draft.url,
      platformIds: draft.platformIds,
    });
    expect(f.mark).toHaveBeenCalledWith(subject, f.tx, 'project', 'summary', [
      { draftId: 'draft', taskId: 'task' },
    ]);
    expect(f.record).toHaveBeenCalledWith(
      f.tx,
      expect.anything(),
      expect.objectContaining({ action: 'summary.tasks_transferred' }),
    );
  });
  it('после потери ответа возвращает прежнюю задачу и не создаёт дубликат или повторный аудит', async () => {
    const f = fixture();
    f.selected.mockResolvedValue([
      { ...draft, taskId: 'existing', state: SummaryTaskState.Released },
    ]);
    expect(await f.service.transfer(subject, 'project', 'summary', { taskIds: ['draft'] })).toEqual(
      { taskIds: ['existing'] },
    );
    expect(f.create).not.toHaveBeenCalled();
    expect(f.record).not.toHaveBeenCalled();
  });
  it('не создаёт задачу при отказе прав и пробрасывает отказ журнала из транзакции', async () => {
    const denied = fixture();
    denied.selected.mockRejectedValue(new Error('403'));
    await expect(
      denied.service.transfer(subject, 'project', 'summary', { taskIds: ['draft'] }),
    ).rejects.toThrow('403');
    expect(denied.create).not.toHaveBeenCalled();
    const f = fixture();
    f.record.mockRejectedValue(new Error('audit failed'));
    await expect(
      f.service.transfer(subject, 'project', 'summary', { taskIds: ['draft'] }),
    ).rejects.toThrow('audit failed');
    expect(f.mark).not.toHaveBeenCalled();
  });
});
