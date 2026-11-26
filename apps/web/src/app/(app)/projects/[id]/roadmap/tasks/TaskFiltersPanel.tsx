'use client';

import type { ProjectTask } from '@cairn/shared';
import { useId, useRef, useState } from 'react';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { TaskFilters } from './TaskFilters';
import { ORIGIN_LABELS } from './constants';
import { TASK_BUTTON, TASK_PRIMARY } from './controls';

export const TASK_FILTER_KEYS = [
  'search',
  'release',
  'loose',
  'integration',
  'assignee',
  'status',
  'origin',
  'from',
  'to',
] as const;

export function taskFilterLabels(
  tasks: ProjectTask[],
  versions: { id: string; label: string }[],
  params: Pick<URLSearchParams, 'get'>,
) {
  const releases = new Map(versions.map((version) => [version.id, version.label]));
  const people = new Map<string, string>();
  for (const task of tasks) {
    if (task.placement) releases.set(task.placement.versionId, task.placement.versionLabel);
    for (const person of task.export?.details?.assignees ?? []) people.set(person.id, person.name);
  }
  const values: Record<string, string> = {
    linked: 'Связаны с Weeek',
    local: 'Без связи с Weeek',
    link: 'Есть ссылка Weeek',
    failed: 'Ошибка синхронизации',
    open: 'Не выполнены',
    done: 'Выполнены',
    weeek_open: 'Открыты в Weeek',
    weeek_done: 'Закрыты в Weeek',
  };
  return TASK_FILTER_KEYS.flatMap((key) => {
    const value = params.get(key);
    if (
      !value ||
      (key === 'loose' && value !== 'true') ||
      (key === 'loose' && params.get('release') === 'loose')
    )
      return [];
    const label =
      key === 'search'
        ? `Поиск: ${value}`
        : key === 'release'
          ? value === 'loose'
            ? 'Вне релиза'
            : `Релиз: ${releases.get(value) ?? 'недоступен'}`
          : key === 'loose'
            ? 'Вне релиза'
            : key === 'assignee'
              ? value === 'unassigned'
                ? 'Без исполнителя'
                : `Исполнитель: ${people.get(value) ?? value}`
              : key === 'origin'
                ? (ORIGIN_LABELS[value as keyof typeof ORIGIN_LABELS] ?? value)
                : key === 'from'
                  ? `Срок от ${value}`
                  : key === 'to'
                    ? `Срок до ${value}`
                    : (values[value] ?? value);
    return [{ key, label }];
  });
}

export function TaskFiltersPanel({
  tasks,
  versions,
  params,
  showTracker,
  onApply,
}: {
  tasks: ProjectTask[];
  versions: { id: string; label: string }[];
  params: URLSearchParams | Readonly<URLSearchParams>;
  showTracker: boolean;
  onApply: (params: URLSearchParams) => void;
}) {
  const formId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => new URLSearchParams(params.toString()));
  const count = taskFilterLabels(tasks, versions, params).length;
  const invalid = !!draft.get('from') && !!draft.get('to') && draft.get('from')! > draft.get('to')!;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={TASK_BUTTON}
        onClick={() => {
          setDraft(new URLSearchParams(params.toString()));
          setOpen(true);
        }}
      >
        Фильтры
        {count > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{count}</span>
        )}
      </button>
      <Drawer
        returnFocusRef={triggerRef}
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Фильтры задач"
        width={DrawerWidth.Half}
        actions={
          <button
            type="submit"
            form={formId}
            aria-label="Применить фильтры"
            className={TASK_PRIMARY}
            disabled={invalid}
          >
            Применить
          </button>
        }
      >
        <form
          id={formId}
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (invalid) return;
            onApply(draft);
            setOpen(false);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Условия применяются вместе. Срок относится к дате выполнения из Weeek.
          </p>
          <TaskFilters
            tasks={tasks}
            versions={versions}
            params={draft}
            showTracker={showTracker}
            change={(key, value) =>
              setDraft((current) => {
                const next = new URLSearchParams(current);
                if (value) next.set(key, value);
                else next.delete(key);
                if (key === 'release') next.delete('loose');
                return next;
              })
            }
          />
          {invalid && (
            <p role="alert" className="text-sm text-destructive">
              Начало периода должно быть не позже конца.
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border bg-background py-4">
            <button
              type="button"
              className={TASK_BUTTON}
              onClick={() => {
                const next = new URLSearchParams(draft);
                for (const key of TASK_FILTER_KEYS) next.delete(key);
                setDraft(next);
              }}
            >
              Сбросить
            </button>
            <button type="button" className={TASK_BUTTON} onClick={() => setOpen(false)}>
              Отмена
            </button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
