import { RoadmapVersionState, TrackerKind, type TrackerImportPreview } from '@cairn/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';
import * as imports from '@/api/hooks/useTaskImport';
import { TaskImportPanel } from './TaskImportPanel';

vi.mock('@/api/hooks');
vi.mock('@/api/hooks/useTaskImport');
const binding = {
  tracker: TrackerKind.Weeek,
  externalProjectId: '7',
  boardId: '11',
  boardColumnId: '31',
  completionColumnId: null,
  updatedAt: '',
  updatedByLabel: null,
};
const preview: TrackerImportPreview = {
  tasks: [
    {
      externalId: '42',
      title: 'Оплата',
      externalUrl: 'https://app.weeek.net/ws/1/task/42',
      boardId: '11',
      boardColumnId: '31',
      isCompleted: false,
      existingTaskId: null,
      blockedReason: null,
      details: {
        projectId: '7',
        assignees: [{ id: 'u1', name: 'Иван Иванов' }],
        author: { id: 'u2', name: 'Мария' },
        createdAt: '2026-11-01',
        startAt: null,
        dueAt: '2026-11-25',
        completedAt: null,
      },
    },
  ],
  people: [{ id: 'u1', name: 'Иван Иванов' }],
  peopleAvailable: true,
  truncated: false,
};
const mutate = vi.fn();
const reset = vi.fn();
function query(data: unknown, overrides = {}) {
  return {
    data,
    error: null,
    isFetching: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never;
}
beforeEach(() => {
  mutate.mockReset();
  reset.mockReset();
  vi.mocked(hooks.useQueryRoadmap).mockReturnValue(
    query({
      versions: [
        {
          id: 'late',
          label: 'v2.0',
          state: RoadmapVersionState.InProgress,
          plannedDate: '2026-12-10',
          position: 1,
        },
        {
          id: 'early',
          label: 'v1.0',
          state: RoadmapVersionState.InProgress,
          plannedDate: '2026-11-30',
          position: 2,
        },
      ],
    }),
  );
  vi.mocked(hooks.useQueryTrackerTargets).mockReturnValue(
    query({
      projects: [{ id: '7', name: 'Разработка' }],
      boards: [
        { id: '11', projectId: '7', name: 'Спринт' },
        { id: '99', projectId: '99', name: 'Чужая доска' },
      ],
      columns: [{ id: '31', boardId: '11', name: 'В работе' }],
    }),
  );
  vi.mocked(imports.useQueryImportTasks).mockReturnValue(query(preview));
  vi.mocked(imports.useMutationImportTasks).mockReturnValue({
    mutate,
    reset,
    data: undefined,
    isPending: false,
    error: null,
  } as never);
});
async function open() {
  render(<TaskImportPanel projectId="project" binding={binding} />);
  await userEvent.click(screen.getByRole('button', { name: 'Подтянуть из Weeek' }));
}

describe('импорт задач из Weeek', () => {
  it('не запрашивает задачи до явного применения фильтров', async () => {
    await open();
    expect(imports.useQueryImportTasks).toHaveBeenLastCalledWith('project', undefined);
    expect(screen.queryByRole('option', { name: 'Чужая доска' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Показать задачи' }));
    expect(imports.useQueryImportTasks).toHaveBeenLastCalledWith('project', {
      boardId: '11',
      status: 'open',
      dateField: 'dueAt',
    });
    expect(screen.getByRole('cell', { name: /Иван Иванов/ })).toBeInTheDocument();
    expect(screen.getByText('Автор: Мария')).toBeInTheDocument();
  });
  it('передаёт статус, колонку, исполнителя и выбранный вид даты', async () => {
    await open();
    await userEvent.selectOptions(screen.getByLabelText('Статус в Weeek'), 'completed');
    await userEvent.selectOptions(screen.getByLabelText('Колонка'), '31');
    await userEvent.selectOptions(screen.getByLabelText('Исполнитель'), 'u1');
    await userEvent.selectOptions(screen.getByLabelText('Какая дата'), 'createdAt');
    fireEvent.change(screen.getByLabelText('Дата с'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Дата по'), { target: { value: '2026-11-25' } });
    await userEvent.click(screen.getByRole('button', { name: 'Показать задачи' }));
    expect(imports.useQueryImportTasks).toHaveBeenLastCalledWith(
      'project',
      expect.objectContaining({
        status: 'completed',
        columnId: '31',
        assigneeId: 'u1',
        dateField: 'createdAt',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-25',
      }),
    );
  });
  it('импортирует только выбранные id, без формулировок из браузера', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Показать задачи' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Импортировать: Оплата' }));
    await userEvent.click(screen.getByRole('button', { name: 'Импортировать выбранные (1)' }));
    expect(mutate).toHaveBeenCalledWith({ boardId: '11', externalIds: ['42'] }, expect.anything());
  });
  it('показывает ближайший разрабатываемый релиз и позволяет выбрать другой', async () => {
    await open();
    expect(
      screen.getByRole('option', { name: 'По умолчанию: v1.0 (в разработке)' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Доска Weeek')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Импортировать в релиз'), 'late');
    await userEvent.click(screen.getByRole('button', { name: 'Показать задачи' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Импортировать: Оплата' }));
    await userEvent.click(screen.getByRole('button', { name: 'Импортировать выбранные (1)' }));
    expect(mutate).toHaveBeenCalledWith(
      { boardId: '11', externalIds: ['42'], versionId: 'late' },
      expect.anything(),
    );
  });
  it('не предлагает импортировать дубли и задачи с недопустимым заголовком', async () => {
    vi.mocked(imports.useQueryImportTasks).mockReturnValue(
      query({
        ...preview,
        tasks: [
          { ...preview.tasks[0], existingTaskId: 'local' },
          {
            ...preview.tasks[0],
            externalId: '43',
            title: 'Длинная',
            blockedReason: 'Формулировка длиннее 300 символов.',
          },
        ],
      }),
    );
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Показать задачи' }));
    expect(screen.getByRole('checkbox', { name: 'Импортировать: Оплата' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Импортировать: Длинная' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Импортировать выбранные (0)' })).toBeDisabled();
  });
  it('объясняет отсутствие имён и усечённую выдачу', async () => {
    vi.mocked(imports.useQueryImportTasks).mockReturnValue(
      query({ ...preview, peopleAvailable: false, truncated: true }),
    );
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Показать задачи' }));
    expect(screen.getByText(/не отдал имена участников/)).toBeInTheDocument();
    expect(screen.getByText(/неполный список Weeek/)).toBeInTheDocument();
  });
  it('отказывает перевёрнутому диапазону до запроса', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Дата с'), { target: { value: '2026-11-25' } });
    fireEvent.change(screen.getByLabelText('Дата по'), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Показать задачи' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Начало периода');
    expect(imports.useQueryImportTasks).toHaveBeenLastCalledWith('project', undefined);
  });
});
