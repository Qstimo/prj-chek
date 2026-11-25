'use client';

import { MAX_TASK_EXPORT_BATCH, TaskExportOutcome } from '@cairn/shared';
import Link from 'next/link';
import { useState } from 'react';
import { describeApiError } from '@/api';
import { useMutationTransferSummaryTasks, useMutationExportTasks } from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { TaskExportSummary } from '@/app/(app)/projects/[id]/roadmap/tasks/TaskExportSummary';

export interface TransferSelection {
  draftIds?: string[];
  taskIds?: string[];
  exportToWeeek: boolean;
}

/** Внешний обмен начинается только после фиксации реестра и использует его прежние id при повторе. */
export function TransferTasksDrawer({
  projectId,
  summaryId,
  selection,
  canExport,
  onClose,
}: {
  projectId: string;
  summaryId: string;
  selection: TransferSelection;
  canExport: boolean;
  onClose: () => void;
}) {
  const transfer = useMutationTransferSummaryTasks(projectId, summaryId);
  const exports = useMutationExportTasks(projectId);
  const [taskIds, setTaskIds] = useState<string[] | undefined>(selection.taskIds);
  const [exportWanted, setExportWanted] = useState(selection.exportToWeeek);
  const busy = transfer.isPending || exports.isPending;
  const count = selection.draftIds?.length ?? selection.taskIds?.length ?? 0;
  const exportResults = exports.data;
  const retryIds = exportResults
    ? exportResults
        .filter(
          (result) =>
            result.outcome === TaskExportOutcome.Failed ||
            result.outcome === TaskExportOutcome.Skipped,
        )
        .map((result) => result.taskId)
    : (taskIds ?? []);
  const doneExport = exportResults !== undefined && retryIds.length === 0;
  const error = describeApiError(transfer.error ?? exports.error);
  const submit = () => {
    if (busy) return;
    if (taskIds) {
      if (exportWanted && canExport && retryIds.length) exports.mutate(retryIds);
      return;
    }
    transfer.mutate(
      { taskIds: selection.draftIds ?? [] },
      {
        onSuccess: (result) => {
          setTaskIds(result.taskIds);
          if (exportWanted && canExport) exports.mutate(result.taskIds);
        },
      },
    );
  };
  return (
    <Drawer
      isOpen
      title={exportWanted ? 'Задачи саммари → Weeek' : 'Перенос в задачи проекта'}
      onClose={() => {
        if (!busy) onClose();
      }}
      width={DrawerWidth.Half}
    >
      <div className="space-y-4">
        <p className="text-sm">
          Выбрано задач: {count}. Переносятся только отмеченные строки; остальные остаются в
          саммари.
        </p>
        {!taskIds && (
          <p className="text-sm text-muted-foreground">
            Задачи появятся во вкладке «Задачи» этого проекта без назначения в релиз, с
            формулировкой, ссылкой, тегами и происхождением из саммари.
          </p>
        )}
        {(canExport || exportWanted) && !taskIds && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={exportWanted}
              disabled={busy}
              onChange={(event) => setExportWanted(event.target.checked)}
            />
            Также выгрузить в привязанную доску Weeek
          </label>
        )}
        {exportWanted && (
          <p className="text-sm text-muted-foreground">
            В Weeek используется доска проекта из настроек задач. Если ссылка Weeek уже указана,
            будет использована существующая задача. При отказе Weeek задачи останутся в реестре,
            выгрузку можно повторить здесь.
          </p>
        )}
        {taskIds && (
          <p role="status" className="text-sm">
            В реестре проекта: {taskIds.length} задач.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {exportResults && <TaskExportSummary results={exportResults} />}
        {exportWanted && !canExport && (
          <p role="alert" className="text-sm text-destructive">
            Подключение или доска Weeek недоступны. Задачи можно перенести в реестр и выгрузить
            позже.
          </p>
        )}
        {exportWanted && count > MAX_TASK_EXPORT_BATCH && (
          <p role="alert" className="text-sm text-destructive">
            Для выгрузки выберите не больше {MAX_TASK_EXPORT_BATCH} задач.
          </p>
        )}
        {(!taskIds || (exportWanted && !doneExport)) && (
          <button
            type="button"
            onClick={submit}
            disabled={busy || (exportWanted && (!canExport || count > MAX_TASK_EXPORT_BATCH))}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {busy
              ? 'Выполняем…'
              : taskIds
                ? exports.data || exports.error
                  ? 'Повторить выгрузку'
                  : 'Выгрузить выбранные'
                : exportWanted
                  ? 'Перенести и выгрузить'
                  : 'Перенести выбранные'}
          </button>
        )}
        <Link href={`/projects/${projectId}/tasks`} className="block text-sm underline">
          Открыть задачи проекта
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          Готово
        </button>
      </div>
    </Drawer>
  );
}
