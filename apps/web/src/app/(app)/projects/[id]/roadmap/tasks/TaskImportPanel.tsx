'use client';

import {
  trackerImportQuerySchema,
  defaultTaskVersion,
  type TrackerBinding,
  type TrackerImportQuery,
} from '@cairn/shared';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';

import { describeApiError } from '@/api';
import { useQueryTrackerTargets, useQueryRoadmap } from '@/api/hooks';
import { useMutationImportTasks, useQueryImportTasks } from '@/api/hooks/useTaskImport';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { Select } from '@/components/Select';
import { TASK_BUTTON } from './controls';

export function TaskImportPanel({
  projectId,
  binding,
}: {
  projectId: string;
  binding: TrackerBinding | null;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [release, setRelease] = useState('auto');
  const roadmap = useQueryRoadmap(projectId, open);
  const defaultVersion = defaultTaskVersion(roadmap?.data?.versions ?? []);
  const [draft, setDraft] = useState<TrackerImportQuery>({
    boardId: binding?.boardId ?? '',
    status: 'open',
    dateField: 'dueAt',
  });
  const [filter, setFilter] = useState<TrackerImportQuery>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [validation, setValidation] = useState<string>();
  const targets = useQueryTrackerTargets(projectId, open);
  const preview = useQueryImportTasks(projectId, open ? filter : undefined);
  const imports = useMutationImportTasks(projectId);
  const boards = (targets.data?.boards ?? []).filter((board) => board.id === binding?.boardId);
  const columns = (targets.data?.columns ?? []).filter(
    (column) => column.boardId === draft.boardId,
  );
  const rows = preview.data?.tasks ?? [];
  const eligible = rows.filter((task) => !task.existingTaskId && !task.blockedReason);
  const chosen = eligible
    .filter((task) => selected.has(task.externalId))
    .map((task) => task.externalId);
  const people = new Map((preview.data?.people ?? []).map((person) => [person.id, person.name]));
  for (const task of rows)
    for (const person of task.details.assignees) people.set(person.id, person.name);
  const error = validation ?? describeApiError(imports.error ?? preview.error ?? targets.error);

  function change<K extends keyof TrackerImportQuery>(key: K, value: TrackerImportQuery[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === 'boardId' ? { columnId: undefined } : {}),
    }));
    setSelected(new Set());
    setFilter(undefined);
    setValidation(undefined);
    imports.reset();
  }

  function search(event: FormEvent) {
    event.preventDefault();
    const parsed = trackerImportQuerySchema.safeParse(draft);
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? 'Проверьте фильтры.');
      return;
    }
    setValidation(undefined);
    setSelected(new Set());
    imports.reset();
    if (filter && JSON.stringify(filter) === JSON.stringify(parsed.data)) void preview.refetch();
    setFilter(parsed.data);
  }

  function runImport() {
    if (!filter) return;
    imports.mutate(
      {
        boardId: filter.boardId,
        externalIds: chosen,
        ...(release !== 'auto' ? { versionId: release || null } : {}),
      },
      {
        onSuccess: (results) => {
          setSelected(
            new Set(
              results
                .filter((result) => result.outcome === 'skipped')
                .map((result) => result.externalId),
            ),
          );
        },
      },
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={!binding}
        onClick={() => {
          setDraft((current) => ({ ...current, boardId: binding?.boardId ?? current.boardId }));
          imports.reset();
          setValidation(undefined);
          setFilter(undefined);
          setSelected(new Set());
          setRelease('auto');
          setOpen(true);
        }}
        className={`${TASK_BUTTON} col-span-2 sm:col-span-1`}
      >
        Подтянуть из Weeek
      </button>
      <Drawer
        returnFocusRef={triggerRef}
        isOpen={open}
        onClose={() => {
          if (!imports.isPending) setOpen(false);
        }}
        title="Импорт задач из Weeek"
        width={DrawerWidth.Release}
        actions={
          filter &&
          preview.data && (
            <button
              type="button"
              onClick={runImport}
              disabled={
                !chosen.length ||
                chosen.length > 50 ||
                imports.isPending ||
                preview.isFetching ||
                roadmap?.isPending ||
                roadmap?.isError
              }
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {imports.isPending ? 'Импорт…' : `Импорт (${chosen.length})`}
            </button>
          )
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Выберите задачи с доски проекта Weeek и релиз. Они появятся со ссылкой, статусом, датами
            и исполнителями. В Weeek ничего не изменится.
          </p>
          <Field label="Импортировать в релиз" id="importRelease">
            <Select
              id="importRelease"
              value={release}
              onChange={setRelease}
              isDisabled={imports.isPending}
            >
              <option value="auto">
                {defaultVersion
                  ? `По умолчанию: ${defaultVersion.label} (в разработке)`
                  : 'По умолчанию: вне релиза (нет релиза в разработке)'}
              </option>
              <option value="">Вне релиза</option>
              {(roadmap?.data?.versions ?? []).map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label}
                </option>
              ))}
            </Select>
            {roadmap?.isPending && (
              <p className="text-xs text-muted-foreground">Загружаем релизы…</p>
            )}
            {roadmap?.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось загрузить релизы. Повторите открытие импорта.
              </p>
            )}
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <form onSubmit={search} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Доска Weeek" id="importBoard">
              <Select
                id="importBoard"
                isDisabled
                value={draft.boardId}
                onChange={(value) => change('boardId', value)}
              >
                <option value="">Выберите доску</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Колонка" id="importColumn">
              <Select
                id="importColumn"
                value={draft.columnId ?? ''}
                onChange={(value) => change('columnId', value || undefined)}
              >
                <option value="">Все колонки</option>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Статус в Weeek" id="importStatus">
              <Select
                id="importStatus"
                value={draft.status}
                onChange={(value) => change('status', value as TrackerImportQuery['status'])}
              >
                <option value="open">Открытые</option>
                <option value="completed">Закрытые</option>
                <option value="all">Все статусы</option>
              </Select>
            </Field>
            <Field label="Исполнитель" id="importAssignee">
              <Select
                id="importAssignee"
                value={draft.assigneeId ?? ''}
                onChange={(value) => change('assigneeId', value || undefined)}
              >
                <option value="">Все исполнители</option>
                <option value="unassigned">Без исполнителя</option>
                {[...people].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
              {!preview.data && (
                <p className="text-xs text-muted-foreground">
                  Имена появятся после первого показа задач.
                </p>
              )}
            </Field>
            <Field label="Искать в названии" id="importSearch">
              <input
                id="importSearch"
                className={INPUT}
                value={draft.search ?? ''}
                onChange={(event) => change('search', event.target.value || undefined)}
              />
            </Field>
            <Field label="Какая дата" id="importDateField">
              <Select
                id="importDateField"
                value={draft.dateField}
                onChange={(value) => change('dateField', value as TrackerImportQuery['dateField'])}
              >
                <option value="dueAt">Срок выполнения</option>
                <option value="createdAt">Создание</option>
                <option value="startAt">Начало</option>
                <option value="completedAt">Завершение</option>
              </Select>
            </Field>
            <Field label="Дата с" id="importFrom">
              <input
                id="importFrom"
                type="date"
                className={INPUT}
                value={draft.dateFrom ?? ''}
                onChange={(event) => change('dateFrom', event.target.value || undefined)}
              />
            </Field>
            <Field label="Дата по" id="importTo">
              <input
                id="importTo"
                type="date"
                className={INPUT}
                value={draft.dateTo ?? ''}
                onChange={(event) => change('dateTo', event.target.value || undefined)}
              />
            </Field>
            <button
              type="submit"
              disabled={!draft.boardId || preview.isFetching || imports.isPending}
              className="self-end rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
            >
              Показать задачи
            </button>
          </form>
          <p className="text-xs text-muted-foreground">
            Границы периода включаются. Задачи без выбранной даты не попадают в период. Импорт не
            отмечает выполнение. Правило завершения можно включить у задачи после импорта.
          </p>
          {preview.isFetching && <Loader size="page" />}
          {filter && preview.data && (
            <>
              {preview.data.truncated && (
                <p role="status" className="text-sm text-amber-600">
                  Получен неполный список Weeek (предел — 2000 задач доски). Можно импортировать
                  показанные задачи; задачи за пределом списка не импортируются.
                </p>
              )}
              {!preview.data.peopleAvailable && (
                <p className="text-sm text-muted-foreground">
                  Weeek не отдал имена участников. Исполнители показаны по доступным
                  идентификаторам.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  Найдено: {rows.length}. Выбрано: {chosen.length}.
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(new Set(eligible.slice(0, 50).map((task) => task.externalId)))
                  }
                  disabled={imports.isPending || !eligible.length}
                  className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  Выбрать доступные (до 50)
                </button>
                <button
                  type="button"
                  onClick={runImport}
                  disabled={
                    !chosen.length ||
                    chosen.length > 50 ||
                    imports.isPending ||
                    preview.isFetching ||
                    roadmap?.isPending ||
                    roadmap?.isError
                  }
                  className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {imports.isPending
                    ? 'Импортируем…'
                    : `Импортировать выбранные (${chosen.length})`}
                </button>
              </div>
              {chosen.length > 50 && (
                <p role="alert" className="text-sm text-destructive">
                  Выберите не больше 50 задач за раз.
                </p>
              )}
              {rows.length === 0 ? (
                <p>По этим фильтрам задач нет.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-2">Выбор</th>
                        <th className="p-2">Задача</th>
                        <th className="p-2">Статус / колонка</th>
                        <th className="p-2">Исполнитель / автор</th>
                        <th className="p-2">Даты Weeek</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((task) => (
                        <tr key={task.externalId} className="border-b border-border align-top">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              aria-label={`Импортировать: ${task.title}`}
                              disabled={
                                !!task.existingTaskId || !!task.blockedReason || imports.isPending
                              }
                              checked={selected.has(task.externalId)}
                              onChange={(event) =>
                                setSelected((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(task.externalId);
                                  else next.delete(task.externalId);
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td className="max-w-sm break-words p-2">
                            <a
                              href={task.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {task.title || 'Без названия'}
                            </a>
                            {task.existingTaskId && (
                              <p className="text-xs text-muted-foreground">Уже есть в проекте</p>
                            )}
                            {task.blockedReason && (
                              <p className="text-xs text-destructive">{task.blockedReason}</p>
                            )}
                          </td>
                          <td className="p-2">
                            {task.isCompleted ? 'Закрыта' : 'Открыта'}
                            <p className="text-xs text-muted-foreground">
                              {targets.data?.columns.find(
                                (column) => column.id === task.boardColumnId,
                              )?.name ?? 'Без колонки'}
                            </p>
                          </td>
                          <td className="p-2">
                            {task.details.assignees.map((person) => person.name).join(', ') ||
                              'Не назначен'}
                            {task.details.author && (
                              <p className="text-xs text-muted-foreground">
                                Автор: {task.details.author.name}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap p-2 text-xs">
                            Создана: {dateOf(task.details.createdAt)}
                            <br />
                            Начало: {dateOf(task.details.startAt)}
                            <br />
                            Срок: {dateOf(task.details.dueAt)}
                            <br />
                            Закрыта: {dateOf(task.details.completedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {imports.data && (
            <div role="status" className="text-sm">
              Импортировано: {imports.data.filter((item) => item.outcome === 'created').length}. Уже
              есть: {imports.data.filter((item) => item.outcome === 'existing').length}. Пропущено:{' '}
              {imports.data.filter((item) => item.outcome === 'skipped').length}.
              {imports.data
                .filter((item) => item.reason && item.outcome === 'skipped')
                .map((item) => (
                  <p key={item.externalId}>
                    #{item.externalId}: {item.reason}
                  </p>
                ))}
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}

const INPUT = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm';
function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
function dateOf(value: string | null) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '—';
}
