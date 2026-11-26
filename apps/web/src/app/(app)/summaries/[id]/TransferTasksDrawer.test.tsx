import { TaskExportOutcome, type TaskExportResult } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as hooks from '@/api/hooks';
import { TransferTasksDrawer, type TransferSelection } from './TransferTasksDrawer';

vi.mock('@/api/hooks');
const transfer = { mutate: vi.fn(), isPending: false, error: null };
const exports = {
  mutate: vi.fn(),
  isPending: false,
  error: null as Error | null,
  data: undefined as TaskExportResult[] | undefined,
};
const selection: TransferSelection = { draftIds: ['draft1', 'draft2'], exportToWeeek: false };
beforeEach(() => {
  vi.clearAllMocks();
  exports.data = undefined;
  exports.error = null;
  transfer.mutate.mockImplementation((_input, options) =>
    options.onSuccess({ taskIds: ['task1', 'task2'] }),
  );
  vi.mocked(hooks.useMutationTransferSummaryTasks).mockReturnValue(transfer as never);
  vi.mocked(hooks.useMutationExportTasks).mockReturnValue(exports as never);
});
function open(chosen = selection, canExport = false) {
  render(
    <TransferTasksDrawer
      projectId="project"
      summaryId="summary"
      selection={chosen}
      canExport={canExport}
      onClose={vi.fn()}
    />,
  );
}
describe('саммари → реестр → Weeek', () => {
  it('без токена переносит только выбранные черновики и не показывает выгрузку', async () => {
    open();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Перенести выбранные' }));
    expect(transfer.mutate).toHaveBeenCalledWith(
      { taskIds: ['draft1', 'draft2'] },
      expect.anything(),
    );
    expect(exports.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('В реестре проекта: 2 задач.');
    expect(screen.getByRole('link', { name: 'Открыть задачи проекта' })).toHaveAttribute(
      'href',
      '/projects/project/tasks',
    );
  });
  it('передаёт в выгрузку id подтверждённых задач, а не черновиков; при частичном отказе повторяет только неудавшиеся', async () => {
    exports.mutate.mockImplementationOnce(() => {
      exports.data = [
        { taskId: 'task1', outcome: TaskExportOutcome.Created, failureCode: null, export: null },
        {
          taskId: 'task2',
          outcome: TaskExportOutcome.Failed,
          failureCode: 'tracker_unavailable',
          export: null,
        },
      ];
    });
    open({ ...selection, exportToWeeek: true }, true);
    await userEvent.click(screen.getByRole('button', { name: 'Перенести и выгрузить' }));
    expect(exports.mutate).toHaveBeenNthCalledWith(1, ['task1', 'task2']);
    await userEvent.click(screen.getByRole('button', { name: 'Повторить выгрузку' }));
    expect(exports.mutate).toHaveBeenNthCalledWith(2, ['task2']);
    expect(transfer.mutate).toHaveBeenCalledTimes(1);
  });
  it('не повторяет перенос после сетевого отказа выгрузки', async () => {
    exports.mutate.mockImplementationOnce(() => {
      exports.error = new Error('Network failed');
    });
    open({ ...selection, exportToWeeek: true }, true);
    await userEvent.click(screen.getByRole('button', { name: 'Перенести и выгрузить' }));
    expect(screen.getByRole('status')).toHaveTextContent('В реестре проекта: 2 задач.');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить выгрузку' }));
    expect(exports.mutate).toHaveBeenLastCalledWith(['task1', 'task2']);
    expect(transfer.mutate).toHaveBeenCalledTimes(1);
  });
  it('выгружает из саммари ранее перенесённую задачу без создания ещё одной', async () => {
    open({ taskIds: ['existing'], exportToWeeek: true }, true);
    await userEvent.click(screen.getByRole('button', { name: 'Выгрузить выбранные' }));
    expect(exports.mutate).toHaveBeenCalledWith(['existing']);
    expect(transfer.mutate).not.toHaveBeenCalled();
  });
  it('при исчезнувшем подключении позволяет отказаться от выгрузки и перенести только в реестр', async () => {
    open({ ...selection, exportToWeeek: true });
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Перенести выбранные' }));
    expect(exports.mutate).not.toHaveBeenCalled();
    expect(transfer.mutate).toHaveBeenCalledTimes(1);
  });
});
