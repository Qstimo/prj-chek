import { TaskOrigin, TrackerKind, type ProjectTask } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as hooks from '@/api/hooks';
import * as taskHooks from '@/api/hooks/useTasks';
import { TaskPlanningPanel } from './TaskPlanningPanel';

vi.mock('@/api/hooks');
vi.mock('@/api/hooks/useTasks');
const mutate = vi.fn();
const binding = {
  tracker: TrackerKind.Weeek,
  externalProjectId: '7',
  boardId: '11',
  boardColumnId: '31',
  updatedAt: '',
  updatedByLabel: null,
};
const task: ProjectTask = {
  id: 'task',
  projectId: 'p',
  title: 'Оплата',
  url: null,
  origin: TaskOrigin.Manual,
  sourceSummaryId: null,
  platformIds: [],
  placement: null,
  createdAt: '',
  updatedAt: '',
  export: {
    tracker: TrackerKind.Weeek,
    externalId: '42',
    externalUrl: null,
    externalBoardId: '11',
    externalColumnId: '31',
    isCompleted: false,
    exportedAt: '',
    updatedAt: '',
    checkedAt: null,
    failureCode: null,
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hooks.useQueryRoadmap).mockReturnValue({
    data: { versions: [{ id: 'v', label: 'v1.0' }] },
    isPending: false,
    isError: false,
  } as never);
  vi.mocked(hooks.useQueryTrackerTargets).mockReturnValue({
    data: {
      columns: [
        { id: 'done', boardId: '11', name: 'Готово' },
        { id: 'other', boardId: '99', name: 'Чужая колонка' },
      ],
    },
  } as never);
  vi.mocked(taskHooks.useMutationPlanTask).mockReturnValue({
    mutate,
    isPending: false,
    error: null,
  } as never);
});
describe('релиз и выполнение задачи', () => {
  it('без подключения скрывает правило Weeek и не запрашивает колонки', () => {
    render(
      <TaskPlanningPanel
        projectId="p"
        task={task}
        binding={binding}
        showTracker={false}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText('Автоматически выполнить при попадании в колонку Weeek'),
    ).not.toBeInTheDocument();
    expect(hooks.useQueryTrackerTargets).toHaveBeenCalledWith('p', false);
    expect(screen.getByLabelText('Релиз задачи')).toBeInTheDocument();
  });
  it('сохраняет выбранный релиз и явное правило, скрывает колонки чужой доски', async () => {
    render(<TaskPlanningPanel projectId="p" task={task} binding={binding} onClose={vi.fn()} />);
    expect(screen.queryByRole('option', { name: 'Чужая колонка' })).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Релиз задачи'), 'v');
    await userEvent.selectOptions(
      screen.getByLabelText('Автоматически выполнить при попадании в колонку Weeek'),
      'done',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(mutate).toHaveBeenCalledWith(
      {
        taskId: 'task',
        input: {
          versionId: 'v',
          isDone: false,
          completionRule: { boardId: '11', columnId: 'done' },
        },
      },
      expect.anything(),
    );
  });
  it('позволяет отключить старое правило после смены доски, не теряя релиз', async () => {
    render(
      <TaskPlanningPanel
        projectId="p"
        task={{ ...task, completionRule: { boardId: 'old', columnId: 'old' } }}
        binding={binding}
        onClose={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Автоматически выполнить при попадании в колонку Weeek'),
      '',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(mutate).toHaveBeenCalledWith(
      { taskId: 'task', input: { versionId: null, completionRule: null } },
      expect.anything(),
    );
  });
});
