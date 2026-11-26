'use client';

import type { ProjectTask, TrackerBinding } from '@cairn/shared';
import { useState, type RefObject } from 'react';
import { describeApiError } from '@/api';
import { useQueryRoadmap, useQueryTrackerTargets } from '@/api/hooks';
import { useMutationPlanTask } from '@/api/hooks/useTasks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Select } from '@/components/Select';

export function TaskPlanningPanel({
  projectId,
  task,
  binding,
  onClose,
  showTracker = true,
  returnFocusRef,
}: {
  projectId: string;
  task: ProjectTask;
  binding: TrackerBinding | null;
  onClose: () => void;
  showTracker?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const roadmap = useQueryRoadmap(projectId);
  const targets = useQueryTrackerTargets(projectId, showTracker && !!task.export && !!binding);
  const save = useMutationPlanTask(projectId);
  const [versionId, setVersionId] = useState(task.placement?.versionId ?? '');
  const [done, setDone] = useState(task.placement?.isDone ?? false);
  const [columnId, setColumnId] = useState(task.completionRule?.columnId ?? '');
  const canAutomate = !!task.export && !!binding && task.export.externalBoardId === binding.boardId;
  const columns = (targets.data?.columns ?? []).filter(
    (column) => column.boardId === binding?.boardId,
  );
  const error = describeApiError(save.error);
  // Сохранение релиза не должно молча переносить старое правило на новую доску.
  const ruleUnchanged = columnId === (task.completionRule?.columnId ?? '');
  return (
    <Drawer
      returnFocusRef={returnFocusRef}
      isOpen
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      title="Релиз и выполнение задачи"
      width={DrawerWidth.Half}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(
            {
              taskId: task.id,
              input: {
                versionId: versionId || null,
                ...(versionId ? { isDone: done } : {}),
                ...(!ruleUnchanged
                  ? {
                      completionRule:
                        columnId && binding ? { boardId: binding.boardId, columnId } : null,
                    }
                  : {}),
              },
            },
            { onSuccess: onClose },
          );
        }}
      >
        <p className="break-words text-sm">{task.title}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <label className="block space-y-1 text-sm">
          <span>Релиз задачи</span>
          <Select value={versionId} onChange={setVersionId}>
            <option value="">Вне релиза</option>
            {(roadmap.data?.versions ?? []).map((version) => (
              <option key={version.id} value={version.id}>
                {version.label}
              </option>
            ))}
          </Select>
        </label>
        {roadmap.isError && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось загрузить релизы. Закройте панель и повторите.
          </p>
        )}
        {versionId && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            Выполнена в релизе
          </label>
        )}
        {showTracker && (
          <>
            <label className="block space-y-1 text-sm">
              <span>Автоматически выполнить при попадании в колонку Weeek</span>
              <Select value={columnId} onChange={setColumnId}>
                <option value="">Не завершать автоматически</option>
                {canAutomate &&
                  columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                {columnId && !columns.some((column) => column.id === columnId) && (
                  <option value={columnId}>Сохранённая колонка {columnId}</option>
                )}
              </Select>
            </label>
            {!canAutomate && (
              <p className="text-sm text-muted-foreground">
                Для включения правила свяжите задачу с доской проекта. Сохранённое правило можно
                отключить.
              </p>
            )}
            {task.completionRule && task.completionRule.boardId !== binding?.boardId && (
              <p className="text-sm text-muted-foreground">
                Сохранённое правило относится к прежней доске и сейчас не действует. Выберите
                колонку текущей доски или отключите правило.
              </p>
            )}
            {targets.isError && (
              <p className="text-sm text-destructive">
                Не удалось получить колонки Weeek. Сохранённое правило можно оставить или отключить.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Проверяем Weeek каждые 10 минут. Правило отмечает задачу выполненной в её релизе и
              меняет его прогресс. Возврат в другую колонку не открывает задачу заново. Без релиза
              правило ожидает размещения.
            </p>
          </>
        )}
        <button
          type="submit"
          disabled={
            save.isPending ||
            roadmap.isPending ||
            roadmap.isError ||
            (!canAutomate && !!columnId && !ruleUnchanged)
          }
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          Сохранить
        </button>
      </form>
    </Drawer>
  );
}
