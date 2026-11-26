'use client';

import {
  MAX_TASK_EXPORT_BATCH,
  isWeeekLink,
  TaskExportOutcome,
  type ProjectTask,
  type ProjectTracker,
  type TaskExportResult,
} from '@cairn/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { describeApiError, summaryFailureOf } from '@/api';
import { hasProjectTrackerConnection } from '@/api/trackerConnection';
import {
  useMutationCreateTask,
  useMutationDeleteTask,
  useMutationDetachTask,
  useMutationExportTasks,
  useMutationLinkTask,
  useMutationSyncTrackerTasks,
  useMutationUpdateTask,
  useQueryPlatforms,
  useQueryProjectTracker,
  useQueryTasks,
  useQueryRoadmap,
} from '@/api/hooks';
import { CheckpointForm } from '@/components/CheckpointForm';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { matchesTaskFilters } from './task-filters';
import { TaskFiltersPanel, TASK_FILTER_KEYS, taskFilterLabels } from './TaskFiltersPanel';
import { TaskActionsPanel } from './TaskActionsPanel';
import { TaskPlanningPanel } from './TaskPlanningPanel';
import { TaskExportCell } from './TaskExportCell';
import { TaskImportPanel } from './TaskImportPanel';
import { TaskExportSummary } from './TaskExportSummary';
import { TASK_BUTTON, TASK_PRIMARY, TASK_DANGER } from './controls';
import {
  EXPORT_TEXTS,
  ORIGIN_LABELS,
  TASKS_TEXTS,
  TASK_COLUMNS,
  TASK_COLUMNS_WITH_EXPORT,
  taskFailureTextOf,
} from './constants';

/** Фильтры применяются в панели, действия строки открываются одним контролом. */
export function TasksScreen({ projectId }: { projectId: string }) {
  const createTrigger = useRef<HTMLButtonElement>(null);
  const taskTrigger = useRef<HTMLButtonElement | null>(null);
  const taskFocus = {
    get current() {
      return taskTrigger.current?.isConnected ? taskTrigger.current : createTrigger.current;
    },
  };
  const router = useRouter();
  const params = useSearchParams();
  const tasks = useQueryTasks(projectId);
  const platforms = useQueryPlatforms(projectId);
  const tracker = useQueryProjectTracker(projectId);
  const roadmap = useQueryRoadmap(projectId);
  const create = useMutationCreateTask(projectId);
  const update = useMutationUpdateTask(projectId);
  const remove = useMutationDeleteTask(projectId);
  const detach = useMutationDetachTask(projectId);
  const exportTasks = useMutationExportTasks(projectId);
  const linkTask = useMutationLinkTask(projectId);
  const syncTasks = useMutationSyncTrackerTasks(projectId);
  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [removing, setRemoving] = useState<ProjectTask | null>(null);
  const [planning, setPlanning] = useState<ProjectTask | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  if (tasks.isPending) return <Loader size="page" />;
  if (tasks.isError || !tasks.data)
    return (
      <p role="alert" className="text-destructive">
        {TASKS_TEXTS.loadFailed}
      </p>
    );
  const rows = tasks.data.filter((task) => matchesTaskFilters(task, params));
  const failed = remove.error ?? exportTasks.error ?? linkTask.error ?? syncTasks.error;
  const failure = summaryFailureOf(failed);
  const error =
    (failure.code && taskFailureTextOf(failure.code)) ??
    describeApiError(failed ?? detach.error ?? update.error ?? create.error);
  const isExportVisible = isExportKnown(tracker.data) && !tracker.isError;
  const chosen = rows.filter((task) => selected.has(task.id)).map((task) => task.id);
  const blocked = blockedReasonOf(tracker.data, chosen.length);
  const results = exportTasks.data;
  const attempts = attemptsOf(results);
  const versions = roadmap?.data?.versions ?? [];
  const filters = taskFilterLabels(tasks.data, versions, params);
  const viewed = tasks.data.find((task) => task.id === viewing);
  const allSelected = rows.length > 0 && chosen.length === rows.length;
  function apply(next: URLSearchParams) {
    router.replace(`?${next}`, { scroll: false });
  }
  function clearFilter(key?: string) {
    const next = new URLSearchParams(params.toString());
    for (const field of key ? [key] : TASK_FILTER_KEYS) next.delete(field);
    if (key === 'loose' || key === 'release') {
      next.delete('loose');
      next.delete('release');
    }
    apply(next);
  }
  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function runExport() {
    exportTasks.mutate(chosen, {
      onSuccess: (done) => {
        const gone = new Set(done.filter(hasArrived).map((result) => result.taskId));
        setSelected((current) => new Set([...current].filter((id) => !gone.has(id))));
      },
    });
  }
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={() => {
            create.reset?.();
            setIsCreating(true);
          }}
          className={TASK_PRIMARY}
          ref={createTrigger}
        >
          {TASKS_TEXTS.create}
        </button>
        <TaskFiltersPanel
          tasks={tasks.data}
          versions={versions}
          params={params}
          showTracker={hasProjectTrackerConnection(tracker.data)}
          onApply={apply}
        />
        {tracker.data?.isOperational && (
          <TaskImportPanel projectId={projectId} binding={tracker.data.binding} />
        )}
      </div>
      {hasProjectTrackerConnection(tracker.data) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <p className="min-w-0 text-muted-foreground">
            {!tracker.data?.isOperational
              ? 'Синхронизация Weeek приостановлена'
              : tracker.data.binding
                ? 'Weeek подключён'
                : 'Выберите доску Weeek в настройках'}
          </p>
          <Link
            href={`/projects/${projectId}/tasks/settings`}
            className="shrink-0 font-medium underline underline-offset-4"
          >
            Настройки задач
          </Link>
        </div>
      )}
      {isExportVisible && (
        <div className="space-y-2">
          <button
            type="button"
            className={TASK_BUTTON}
            disabled={!tracker.data?.isOperational || !tracker.data.binding || syncTasks.isPending}
            onClick={() => syncTasks.mutate()}
          >
            {syncTasks.isPending ? 'Синхронизируем…' : 'Синхронизировать с Weeek'}
          </button>
          <p className="text-xs text-muted-foreground">
            Обновляет статусы всех связанных задач проекта и применяет правила завершения.
          </p>
          {syncTasks.data && (
            <p role="status" className="text-sm">
              Проверено: {syncTasks.data.checked}. Найдено в Weeek: {syncTasks.data.found}.
              {syncTasks.data.failureCode && ` ${taskFailureTextOf(syncTasks.data.failureCode) ?? 'Обмен с Weeek не удался. Повторите синхронизацию.'}`}
            </p>
          )}
        </div>
      )}
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Применённые фильтры">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              aria-label={`Убрать фильтр: ${filter.label}`}
              onClick={() => clearFilter(filter.key)}
              className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs"
            >
              <span className="truncate">{filter.label}</span>
              <span aria-hidden>×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => clearFilter()}
            className="min-h-9 px-2 text-xs underline"
          >
            Сбросить фильтры
          </button>
        </div>
      )}
      {(params.get('from') ?? '') > (params.get('to') ?? '9999-12-31') && (
        <p role="alert" className="text-sm text-destructive">
          Начало периода должно быть не позже конца. Измените условия в фильтрах.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          Показано {rows.length} из {tasks.data.length} задач.
        </p>
        {isExportVisible && rows.length > 0 && (
          <button
            type="button"
            className="min-h-9 text-sm underline underline-offset-4"
            onClick={() =>
              setSelected((current) => {
                const next = new Set(current);
                for (const row of rows) {
                  if (allSelected) next.delete(row.id);
                  else next.add(row.id);
                }
                return next;
              })
            }
          >
            {allSelected ? 'Снять выбор показанных' : 'Выбрать показанные'}
          </button>
        )}
      </div>
      {isExportVisible && chosen.length === 0 && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Отметьте задачи галочками, чтобы выгрузить их в Weeek.
        </p>
      )}
      {isExportVisible && chosen.length > 0 && (
        <div className="sticky top-20 z-20 space-y-2 rounded-lg border border-border bg-surface p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {chosen.length ? `Выбрано: ${chosen.length}` : 'Отметьте задачи для выгрузки в Weeek'}
            </p>
            <button
              type="button"
              onClick={runExport}
              disabled={blocked !== undefined || exportTasks.isPending}
              className={TASK_BUTTON}
            >
              {exportTasks.isPending ? 'Выгружаем…' : EXPORT_TEXTS.action}
            </button>
          </div>
          {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
          {selected.size > chosen.length && (
            <p className="text-xs text-muted-foreground">
              Скрытые фильтрами задачи не попадут в выгрузку.
            </p>
          )}
        </div>
      )}
      {results !== undefined && <TaskExportSummary results={results} />}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
          <p>{tasks.data.length ? 'По выбранным фильтрам задач нет.' : TASKS_TEXTS.empty}</p>
          {tasks.data.length > 0 && (
            <button type="button" className="mt-3 underline" onClick={() => clearFilter()}>
              Показать все задачи
            </button>
          )}
        </div>
      ) : (
        <table className="block w-full text-sm lg:table lg:table-fixed">
          <caption className="sr-only">Задачи проекта</caption>
          <thead className="hidden lg:table-header-group">
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {(isExportVisible ? TASK_COLUMNS_WITH_EXPORT : TASK_COLUMNS).map((column) => (
                <th key={column.key} className={`${column.width} px-3 py-3 font-medium`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="grid gap-3 sm:grid-cols-2 lg:table-row-group">
            {rows.map((task) => (
              <tr
                key={task.id}
                className={`grid ${isExportVisible ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'} gap-x-3 gap-y-3 rounded-lg border border-border bg-surface p-4 align-top lg:table-row lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:p-0`}
              >
                {isExportVisible && (
                  <td className="col-start-1 row-start-1 block min-w-0 lg:table-cell lg:px-2 lg:py-3">
                    <label className="inline-flex h-10 w-8 cursor-pointer items-start justify-center pt-1 lg:w-full">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={selected.has(task.id)}
                        onChange={(event) => toggle(task.id, event.target.checked)}
                      />
                      <span className="sr-only">{EXPORT_TEXTS.select(task.title)}</span>
                    </label>
                  </td>
                )}
                <td
                  className={`${isExportVisible ? 'col-start-2' : 'col-start-1'} col-span-2 row-start-1 block min-w-0 lg:table-cell lg:px-3 lg:py-4`}
                >
                  <span className="block break-words font-medium leading-6">{task.title}</span>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    <span>{ORIGIN_LABELS[task.origin]}</span>
                    {task.export?.details?.assignees.length ? (
                      <span>
                        {task.export.details.assignees.map((person) => person.name).join(', ')}
                      </span>
                    ) : null}
                    {task.export?.details?.dueAt && (
                      <span>
                        Срок: {new Date(task.export.details.dueAt).toLocaleDateString('ru-RU')}
                      </span>
                    )}
                    {task.completionRule?.columnId ? (
                      <span>Автозавершение включено</span>
                    ) : task.completionRule ? (
                      <span>Автозавершение отключено</span>
                    ) : tracker.data?.binding?.completionColumnId ? (
                      <span>Общее правило завершения</span>
                    ) : null}
                  </div>
                </td>
                <td
                  className={`${isExportVisible ? 'col-start-2' : 'col-start-1'} row-start-2 block min-w-0 self-center lg:table-cell lg:px-3 lg:py-4`}
                >
                  <span className="block text-[11px] text-muted-foreground lg:hidden">Релиз</span>
                  {task.placement ? (
                    <>
                      <span className="break-words">{task.placement.versionLabel}</span>
                      <span
                        className={`mt-1 block text-xs ${task.placement.isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                      >
                        {task.placement.isDone ? 'Выполнена' : 'В работе'}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{TASKS_TEXTS.loose}</span>
                  )}
                </td>
                {isExportVisible && (
                  <td className="col-span-2 col-start-2 row-start-3 block min-w-0 border-t border-border pt-3 lg:table-cell lg:border-0 lg:px-3 lg:py-4">
                    <TaskExportCell compact task={task} attempt={attempts.get(task.id) ?? null} />
                  </td>
                )}
                <td className="col-start-[-2] row-start-2 block self-center lg:table-cell lg:px-3 lg:py-4">
                  <button
                    type="button"
                    aria-label={`Действия: ${task.title}`}
                    onClick={(event) => {
                      taskTrigger.current = event.currentTarget;
                      detach.reset?.();
                      linkTask.reset?.();
                      setViewing(task.id);
                    }}
                    className={`${TASK_BUTTON} !h-9 !px-3`}
                  >
                    Действия
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Link
        href={`/projects/${projectId}/roadmap`}
        className="inline-block min-h-10 py-2 text-sm underline underline-offset-4"
      >
        {TASKS_TEXTS.back}
      </Link>
      {viewed && (
        <TaskActionsPanel
          returnFocusRef={taskFocus}
          task={viewed}
          attempt={attempts.get(viewed.id) ?? null}
          showTracker={isExportVisible}
          canLink={
            isExportVisible &&
            viewed.export === null &&
            isWeeekLink(viewed.url) &&
            !!tracker.data?.isOperational &&
            !!tracker.data.binding
          }
          isLinking={linkTask.isPending}
          error={describeApiError(detach.error ?? linkTask.error)}
          onClose={() => setViewing(null)}
          onEdit={() => {
            update.reset?.();
            setViewing(null);
            setEditing(viewed);
          }}
          onPlan={() => {
            setViewing(null);
            setPlanning(viewed);
          }}
          onLink={() => linkTask.mutate(viewed.id)}
          onDetach={() => detach.mutate(viewed.id, { onSuccess: () => setViewing(null) })}
          onRemove={() => {
            remove.reset?.();
            setViewing(null);
            setRemoving(viewed);
          }}
        />
      )}
      {planning && (
        <TaskPlanningPanel
          returnFocusRef={taskFocus}
          showTracker={hasProjectTrackerConnection(tracker.data)}
          projectId={projectId}
          task={planning}
          binding={tracker.data?.binding ?? null}
          onClose={() => setPlanning(null)}
        />
      )}
      <Drawer
        isOpen={removing !== null}
        onClose={() => {
          if (!remove.isPending) setRemoving(null);
        }}
        returnFocusRef={taskFocus}
        title={TASKS_TEXTS.removeLabel}
        width={DrawerWidth.Half}
      >
        {removing && (
          <div className="space-y-4">
            <p className="break-words font-medium">{removing.title}</p>
            <p className="text-sm text-muted-foreground">{TASKS_TEXTS.removeQuestion}</p>
            {remove.error && (
              <p role="alert" className="text-sm text-destructive">
                {describeApiError(remove.error)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={TASK_DANGER}
                disabled={remove.isPending}
                onClick={() => remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
              >
                {remove.isPending ? 'Удаляем…' : TASKS_TEXTS.removeConfirm}
              </button>
              <button
                type="button"
                className={TASK_BUTTON}
                disabled={remove.isPending}
                onClick={() => setRemoving(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </Drawer>
      <Drawer
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        returnFocusRef={createTrigger}
        title={TASKS_TEXTS.createTitle}
        width={DrawerWidth.Half}
      >
        <CheckpointForm
          submitLabel="Завести"
          {...(platforms.data?.length ? { platforms: platforms.data } : {})}
          isSubmitting={create.isPending}
          error={describeApiError(create.error)}
          onSubmit={(input) => create.mutate(input, { onSuccess: () => setIsCreating(false) })}
        />
      </Drawer>
      <Drawer
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        returnFocusRef={taskFocus}
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
            {...(platforms.data?.length ? { platforms: platforms.data } : {})}
            isSubmitting={update.isPending}
            error={describeApiError(update.error)}
            onCancel={() => setEditing(null)}
            onSubmit={(input) =>
              update.mutate({ taskId: editing.id, input }, { onSuccess: () => setEditing(null) })
            }
          />
        )}
      </Drawer>
    </div>
  );
}

/**
 * Итог последней выгрузки по задачам, разложенный по идентификатору.
 *
 * Нужен строкам: у задачи, чей первый обмен не удался, зеркала нет вовсе, и
 * причина отказа приходит только здесь. Картой, а не поиском по набору у
 * каждой строки: набор доходит до пятидесяти (`MAX_TASK_EXPORT_BATCH`), и
 * перебор на каждую строку — пятьдесят обходов пятидесяти элементов там, где
 * хватает одного.
 */
function attemptsOf(results: TaskExportResult[] | undefined): Map<string, TaskExportResult> {
  return new Map((results ?? []).map((result) => [result.taskId, result]));
}

/**
 * Уехала ли задача: завелась в трекере или исправилась там.
 *
 * `failed` и `skipped` сюда не попадают намеренно — с ними в трекере не
 * произошло ничего, и считать их уехавшими значило бы снять отметку ровно с
 * тех задач, которые человек сейчас повторит.
 */
function hasArrived(result: TaskExportResult): boolean {
  return (
    result.outcome === TaskExportOutcome.Created || result.outcome === TaskExportOutcome.Updated
  );
}

/**
 * Есть ли на установке трекер — то есть надо ли вообще говорить о выгрузке.
 *
 * Пока готовность неизвестна, колонки нет: лоадер или мигающая колонка
 * из-за трекера, который на этом экране дело десятое, хуже её отсутствия.
 */
function isExportKnown(tracker: ProjectTracker | undefined): tracker is ProjectTracker {
  return tracker !== undefined && hasProjectTrackerConnection(tracker);
}

/**
 * Почему выгрузить нельзя — одной фразой, или `undefined`, если можно.
 *
 * Порядок причин — порядок починки: сначала то, что чинит администратор,
 * потом то, что чинится на этом экране, и только потом отметки. Обратный
 * порядок просил бы отметить задачи, которым всё равно некуда ехать.
 */
function blockedReasonOf(tracker: ProjectTracker | undefined, chosen: number): string | undefined {
  if (tracker === undefined) {
    return EXPORT_TEXTS.blocked;
  }

  if (!tracker.isOperational) {
    return EXPORT_TEXTS.blocked;
  }

  if (tracker.binding === null) {
    return EXPORT_TEXTS.bindingMissing;
  }

  if (chosen === 0) {
    return EXPORT_TEXTS.nothingSelected;
  }

  // Предел — про срок ответа нашей ручки: выгрузка идёт по запросу на задачу
  // и последовательно, потому что чужой API считает частоту, а оборванный по
  // таймауту набор не сказал бы, сколько задач уже уехало, — повтор правил бы
  // в трекере уже уехавшее. Сам срок держит не это число, а бюджет времени на
  // сервере (`EXPORT_BATCH_BUDGET_MS`): пятьдесят медленных обменов вынесли бы
  // ответ за любой прокси. Здесь оно сказано человеку **до** нажатия, и этим
  // отличается от бюджета, о котором он узнаёт исходом «не пробовали».
  if (chosen > MAX_TASK_EXPORT_BATCH) {
    return EXPORT_TEXTS.tooMany(MAX_TASK_EXPORT_BATCH);
  }

  return undefined;
}
