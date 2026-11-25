import { describe, expect, it } from 'vitest';
import { TaskOrigin, TrackerKind, type ProjectTask } from '@cairn/shared';
import { matchesTaskFilters } from './task-filters';

const task: ProjectTask = {
  id: 'task',
  projectId: 'p',
  title: 'Оплата картой',
  url: null,
  origin: TaskOrigin.Tracker,
  sourceSummaryId: null,
  platformIds: [],
  createdAt: '',
  updatedAt: '',
  placement: {
    versionId: 'v',
    versionLabel: '1.0',
    isDone: false,
    position: 1,
    carriedFromVersionId: null,
  },
  export: {
    tracker: TrackerKind.Weeek,
    externalId: '42',
    externalUrl: null,
    externalBoardId: '11',
    externalColumnId: '31',
    isCompleted: true,
    exportedAt: '',
    updatedAt: '',
    checkedAt: '',
    failureCode: null,
    details: {
      projectId: '7',
      assignees: [{ id: 'u', name: 'Иван' }],
      author: null,
      createdAt: null,
      startAt: null,
      dueAt: '2026-11-25',
      completedAt: null,
    },
  },
};

describe('фильтры страницы задач', () => {
  const match = (query: string, row = task) => matchesTaskFilters(row, new URLSearchParams(query));
  it('пересекает релиз, связь, исполнителя, статус и поиск', () => {
    expect(match('release=v&integration=linked&assignee=u&status=weeek_done&search=ОПЛ')).toBe(
      true,
    );
    for (const query of [
      'release=other',
      'release=loose',
      'loose=true',
      'integration=local',
      'assignee=other',
      'assignee=unassigned',
      'status=done',
      'status=weeek_open',
      'search=другое',
      'origin=manual',
    ])
      expect(match(query), query).toBe(false);
  });
  it('включает границы срока и исключает задачи без даты из периода', () => {
    expect(match('from=2026-11-25&to=2026-11-25')).toBe(true);
    expect(match('to=2026-11-24')).toBe(false);
    expect(match('from=2026-11-01', { ...task, export: null })).toBe(false);
  });
  it('различает ручную ссылку без связи, ошибку обмена и обычную локальную задачу', () => {
    expect(
      match('integration=link', {
        ...task,
        export: null,
        url: 'https://app.weeek.net/ws/1/task/42',
      }),
    ).toBe(true);
    expect(match('integration=link')).toBe(false);
    expect(match('integration=failed')).toBe(false);
    expect(
      match('integration=failed', {
        ...task,
        export: { ...task.export!, failureCode: 'tracker_rejected' },
      }),
    ).toBe(true);
  });
});
