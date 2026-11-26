'use client';

import type { ProjectTask, TaskExportResult } from '@cairn/shared';
import type { RefObject } from 'react';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { TaskExportCell } from './TaskExportCell';
import { ORIGIN_LABELS, TASKS_TEXTS } from './constants';
import { TASK_BUTTON } from './controls';

export function TaskActionsPanel({
  task,
  attempt,
  showTracker,
  canLink,
  isLinking,
  error,
  onClose,
  onEdit,
  onPlan,
  onLink,
  onDetach,
  onRemove,
  returnFocusRef,
}: {
  task: ProjectTask;
  attempt: TaskExportResult | null;
  showTracker: boolean;
  canLink: boolean;
  isLinking: boolean;
  error?: string;
  onClose: () => void;
  onEdit: () => void;
  onPlan: () => void;
  onLink: () => void;
  onDetach: () => void;
  onRemove: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <Drawer
      isOpen
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      title="Задача проекта"
      width={DrawerWidth.Half}
    >
      <div className="space-y-5">
        <h2 className="break-words text-lg font-medium">{task.title}</h2>
        <div className="grid gap-2">
          <button type="button" onClick={onEdit} className={`${TASK_BUTTON} w-full`}>
            Править
          </button>
          <button type="button" onClick={onPlan} className={`${TASK_BUTTON} w-full`}>
            Релиз и выполнение
          </button>
          {canLink && (
            <button
              type="button"
              disabled={isLinking}
              onClick={onLink}
              className={`${TASK_BUTTON} w-full`}
            >
              {isLinking ? 'Связываем…' : 'Связать с Weeek'}
            </button>
          )}
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Источник</dt>
          <dd>{ORIGIN_LABELS[task.origin]}</dd>
          <dt className="text-muted-foreground">Релиз</dt>
          <dd>{task.placement?.versionLabel ?? 'Вне релиза'}</dd>
          <dt className="text-muted-foreground">Выполнение</dt>
          <dd>
            {task.placement?.isDone
              ? 'Выполнена'
              : task.placement
                ? 'В работе'
                : 'Релиз ещё не назначен'}
          </dd>
        </dl>
        {task.url && (!showTracker || task.url !== task.export?.externalUrl) && (
          <a
            href={task.url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm underline"
          >
            Открыть ссылку задачи ↗
          </a>
        )}
        {showTracker && (
          <section className="space-y-2 rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium">Weeek</h3>
            <TaskExportCell task={task} attempt={attempt} />
            {task.completionRule && (
              <p className="text-xs text-muted-foreground">
                Включено автоматическое завершение по колонке Weeek.
              </p>
            )}
          </section>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="border-t border-border pt-4">
          {task.placement ? (
            <button type="button" onClick={onDetach} className={`${TASK_BUTTON} w-full`}>
              {TASKS_TEXTS.detach}
            </button>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              className={`${TASK_BUTTON} w-full text-destructive`}
            >
              {TASKS_TEXTS.remove}
            </button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {task.placement
              ? 'Задача останется в проекте. Изменится только состав релиза.'
              : 'Удаление из проекта не удаляет задачу в Weeek.'}
          </p>
        </div>
      </div>
    </Drawer>
  );
}
