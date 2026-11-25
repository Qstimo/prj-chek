import { isWeeekLink, type ProjectTask } from '@cairn/shared';

export function matchesTaskFilters(
  task: ProjectTask,
  params: Pick<URLSearchParams, 'get'>,
): boolean {
  const release = params.get('release');
  const integration = params.get('integration');
  const assignee = params.get('assignee');
  const status = params.get('status');
  const search = params.get('search')?.trim().toLocaleLowerCase('ru');
  const origin = params.get('origin');
  if ((params.get('loose') === 'true' || release === 'loose') && task.placement) return false;
  if (release && release !== 'loose' && task.placement?.versionId !== release) return false;
  if (integration === 'linked' && !task.export) return false;
  if (integration === 'local' && task.export) return false;
  if (integration === 'link' && (task.export || !isWeeekLink(task.url))) return false;
  if (integration === 'failed' && !task.export?.failureCode) return false;
  const people = task.export?.details?.assignees ?? [];
  if (assignee === 'unassigned' && people.length) return false;
  if (assignee && assignee !== 'unassigned' && !people.some((person) => person.id === assignee))
    return false;
  if (status === 'done' && task.placement?.isDone !== true) return false;
  if (status === 'open' && task.placement?.isDone === true) return false;
  if (status === 'weeek_done' && task.export?.isCompleted !== true) return false;
  if (status === 'weeek_open' && task.export?.isCompleted !== false) return false;
  if (origin && task.origin !== origin) return false;
  if (search && !task.title.toLocaleLowerCase('ru').includes(search)) return false;
  const due = task.export?.details?.dueAt?.slice(0, 10);
  const from = params.get('from');
  const to = params.get('to');
  if ((from || to) && (!due || (from && due < from) || (to && due > to))) return false;
  return true;
}
