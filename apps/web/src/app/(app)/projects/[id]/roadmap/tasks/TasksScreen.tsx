'use client';

import type { ProjectTask } from '@cairn/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { describeApiError, summaryFailureOf } from '@/api';
import {
  useMutationCreateTask,
  useMutationDeleteTask,
  useMutationDetachTask,
  useMutationUpdateTask,
  useQueryPlatforms,
  useQueryTasks,
} from '@/api/hooks';
import { CheckpointForm } from '@/components/CheckpointForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';

import { ORIGIN_LABELS, TASKS_TEXTS, TASK_COLUMNS, TASK_FAILURES } from './constants';

/**
 * Реестр задач проекта.
 *
 * Живёт под «Роадмапом», а не своим разделом: право на задачу — право на
 * «Роадмап», а список разделов закрыт составом секций. Поэтому и адрес
 * вложен в роадмап, и выдачу проверяет та же ручка.
 *
 * Фильтр живёт в адресе (`?loose`), как `?view` и `?tag`: ссылку на «что
 * не разложено по версиям» отправляют соседу, и состояние, спрятанное в
 * памяти компонента, такую ссылку сделать не позволяет.
 *
 * Платформы запрашиваются **мягко**: без выдачи на «Инфо» их не видно, и
 * тогда переключателей тегов просто не будет — отказ этого запроса не
 * повод показать экран ошибки вместо задач.
 */
export function TasksScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const isLoose = params.get('loose') === 'true';
  const tasks = useQueryTasks(projectId);
  const platforms = useQueryPlatforms(projectId);
  const create = useMutationCreateTask(projectId);
  const update = useMutationUpdateTask(projectId);
  const remove = useMutationDeleteTask(projectId);
  const detach = useMutationDetachTask(projectId);
  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [removing, setRemoving] = useState<ProjectTask | null>(null);

  if (tasks.isPending) {
    return <Loader size="page" />;
  }

  if (tasks.isError || !tasks.data) {
    return (
      <p role="alert" className="text-destructive">
        {TASKS_TEXTS.loadFailed}
      </p>
    );
  }

  const rows = isLoose ? tasks.data.filter((task) => task.placement === null) : tasks.data;
  const failure = summaryFailureOf(remove.error);
  const error =
    (failure.code && TASK_FAILURES[failure.code]) ??
    describeApiError(remove.error ?? detach.error ?? update.error ?? create.error);

  /** Переключение фильтра: состояние живёт в адресе, а не в памяти. */
  function toggleLoose(): void {
    router.replace(isLoose ? '?' : '?loose=true', { scroll: false });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleLoose}
          aria-pressed={isLoose}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          {isLoose ? TASKS_TEXTS.filterAll : TASKS_TEXTS.filterLoose}
        </button>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          {TASKS_TEXTS.create}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          {isLoose ? TASKS_TEXTS.emptyLoose : TASKS_TEXTS.empty}
        </p>
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {TASK_COLUMNS.map((column) => (
                <th key={column.key} className={`${column.width} px-2 py-2 font-medium`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((task) => (
              <tr key={task.id} className="border-b border-border align-top">
                <td className="px-2 py-2">
                  <span className="block truncate" title={task.title}>
                    {task.title}
                  </span>
                  {task.url && (
                    <a
                      href={task.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-muted-foreground underline"
                    >
                      {task.url}
                    </a>
                  )}
                </td>
                <td className="px-2 py-2">
                  {task.placement ? (
                    task.placement.versionLabel
                  ) : (
                    <span className="text-muted-foreground">{TASKS_TEXTS.loose}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-muted-foreground">{ORIGIN_LABELS[task.origin]}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(task)}
                      className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                      Править
                    </button>
                    {task.placement ? (
                      <button
                        type="button"
                        onClick={() => detach.mutate(task.id)}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                      >
                        {TASKS_TEXTS.detach}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRemoving(task)}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                      >
                        {TASKS_TEXTS.remove}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Link href={`/projects/${projectId}/roadmap`} className="inline-block text-sm underline">
        {TASKS_TEXTS.back}
      </Link>

      {removing && (
        <ConfirmDialog
          label={TASKS_TEXTS.removeLabel}
          confirmLabel={TASKS_TEXTS.removeConfirm}
          onConfirm={() => {
            remove.mutate(removing.id);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        >
          {TASKS_TEXTS.removeQuestion}
        </ConfirmDialog>
      )}

      <Drawer
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title={TASKS_TEXTS.createTitle}
        width={DrawerWidth.Half}
      >
        <CheckpointForm
          submitLabel="Завести"
          {...(platforms.data && platforms.data.length > 0 ? { platforms: platforms.data } : {})}
          isSubmitting={create.isPending}
          onSubmit={(input) => {
            create.mutate(input, { onSuccess: () => setIsCreating(false) });
          }}
        />
      </Drawer>

      <Drawer
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={TASKS_TEXTS.editTitle}
        width={DrawerWidth.Half}
      >
        {editing && (
          <CheckpointForm
            initial={{
              title: editing.title,
              url: editing.url ?? null,
              platformIds: editing.platformIds,
            }}
            submitLabel="Сохранить"
            {...(platforms.data && platforms.data.length > 0 ? { platforms: platforms.data } : {})}
            isSubmitting={update.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => {
              update.mutate(
                { taskId: editing.id, input },
                { onSuccess: () => setEditing(null) },
              );
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
