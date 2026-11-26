'use client';

import type { ProjectTask } from '@cairn/shared';
import { Select } from '@/components/Select';
import { ORIGIN_LABELS } from './constants';

export function TaskFilters({
  tasks,
  versions,
  params,
  change,
  showTracker = true,
}: {
  tasks: ProjectTask[];
  versions: { id: string; label: string }[];
  params: Pick<URLSearchParams, 'get'>;
  change: (key: string, value: string) => void;
  showTracker?: boolean;
}) {
  const releases = new Map(versions.map((version) => [version.id, version.label]));
  const people = new Map<string, string>();
  for (const task of tasks) {
    if (task.placement) releases.set(task.placement.versionId, task.placement.versionLabel);
    for (const person of task.export?.details?.assignees ?? []) people.set(person.id, person.name);
  }
  const select = (key: string, label: string, values: [string, string][]) => (
    <label className="space-y-1 text-sm" key={key}>
      <span className="block text-muted-foreground">{label}</span>
      <Select
        value={
          key === 'release' && params.get('loose') === 'true' ? 'loose' : (params.get(key) ?? '')
        }
        onChange={(value) => change(key, value)}
      >
        <option value="">Все</option>
        {values.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </Select>
    </label>
  );
  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-sm">
        <span className="block text-muted-foreground">Поиск задач</span>
        <input
          type="search"
          value={params.get('search') ?? ''}
          onChange={(e) => change('search', e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {select('release', 'Релиз', [['loose', 'Вне релиза'], ...releases])}
      {showTracker &&
        select('integration', 'Интеграция Weeek', [
          ['linked', 'Связаны с Weeek'],
          ['local', 'Без связи'],
          ['link', 'Есть ссылка, ещё не связаны'],
          ['failed', 'Ошибка синхронизации'],
        ])}
      {select('assignee', 'Исполнитель', [['unassigned', 'Без исполнителя'], ...people])}
      {select('status', 'Статус', [
        ['open', 'Не выполнены здесь'],
        ['done', 'Выполнены здесь'],
        ['weeek_open', 'Открыты в Weeek'],
        ['weeek_done', 'Закрыты в Weeek'],
      ])}
      {select('origin', 'Источник', Object.entries(ORIGIN_LABELS))}
      <label className="space-y-1 text-sm">
        <span className="block text-muted-foreground">Срок от</span>
        <input
          type="date"
          value={params.get('from') ?? ''}
          onChange={(e) => change('from', e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block text-muted-foreground">Срок до</span>
        <input
          type="date"
          value={params.get('to') ?? ''}
          onChange={(e) => change('to', e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
    </div>
  );
}
