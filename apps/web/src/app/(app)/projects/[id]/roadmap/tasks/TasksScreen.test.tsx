import { TaskOrigin, type ProjectTask } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api';
import * as hooks from '@/api/hooks';

import { TasksScreen } from './TasksScreen';
import { TASKS_TEXTS } from './constants';

vi.mock('@/api/hooks');

const replace = vi.fn();
const search = { value: '' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search.value),
}));

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

/** Задача вне версии: её можно удалить. */
const LOOSE: ProjectTask = {
  id: '22222222-2222-2222-2222-222222222222',
  projectId: PROJECT_ID,
  title: 'Поднять предел текста',
  url: null,
  origin: TaskOrigin.Manual,
  sourceSummaryId: null,
  platformIds: [],
  placement: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
};

/** Задача в версии: её можно только вынуть. */
const PLACED: ProjectTask = {
  ...LOOSE,
  id: '33333333-3333-3333-3333-333333333333',
  title: 'Оплата картой',
  origin: TaskOrigin.Summary,
  sourceSummaryId: '44444444-4444-4444-4444-444444444444',
  placement: {
    versionId: '55555555-5555-5555-5555-555555555555',
    versionLabel: 'v1.2',
    isDone: false,
    position: 1,
    carriedFromVersionId: null,
  },
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), isPending: false, error: null, ...overrides } as never;
}

const create = mutation();
const update = mutation();
const remove = mutation();
const detach = mutation();

/** Шпион `mutate`: моки объявлены как `never`. */
function mutateOf(stub: unknown): ReturnType<typeof vi.fn> {
  return (stub as { mutate: ReturnType<typeof vi.fn> }).mutate;
}

beforeEach(() => {
  replace.mockReset();
  search.value = '';
  vi.mocked(hooks.useQueryTasks).mockReturnValue(query([LOOSE, PLACED]));
  vi.mocked(hooks.useQueryPlatforms).mockReturnValue(query([]));
  vi.mocked(hooks.useMutationCreateTask).mockReturnValue(create);
  vi.mocked(hooks.useMutationUpdateTask).mockReturnValue(update);
  vi.mocked(hooks.useMutationDeleteTask).mockReturnValue(remove);
  vi.mocked(hooks.useMutationDetachTask).mockReturnValue(detach);
});

describe('реестр задач проекта', () => {
  it('показывает задачи, версию и происхождение', () => {
    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByText('Поднять предел текста')).toBeInTheDocument();
    expect(screen.getByText('v1.2')).toBeInTheDocument();
    expect(screen.getByText(TASKS_TEXTS.loose)).toBeInTheDocument();
    expect(screen.getByText('Из саммари')).toBeInTheDocument();
  });

  it('пустой реестр говорит словами, а не пустым местом', () => {
    // Пустая таблица читается как сбой загрузки, и человек жмёт
    // обновление вместо того, чтобы завести первую задачу.
    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([]));

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByText(TASKS_TEXTS.empty)).toBeInTheDocument();
  });

  it('фильтр живёт в адресе, а не в памяти компонента', async () => {
    // Ссылку «что не разложено по версиям» отправляют соседу, и
    // состояние в памяти такую ссылку сделать не позволяет.
    render(<TasksScreen projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: TASKS_TEXTS.filterLoose }));

    expect(replace).toHaveBeenCalledWith('?loose=true', { scroll: false });
  });

  it('фильтр из адреса оставляет только задачи вне версий', () => {
    search.value = 'loose=true';

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByText('Поднять предел текста')).toBeInTheDocument();
    expect(screen.queryByText('Оплата картой')).not.toBeInTheDocument();
  });

  it('у задачи в версии нет удаления — только «вынуть»', () => {
    // Удаление размещённой задачи меняло бы прогресс версии с этого
    // экрана и молча; сервер его и не разрешает.
    search.value = '';

    render(<TasksScreen projectId={PROJECT_ID} />);

    const rows = screen.getAllByRole('row');
    const placedRow = rows.find((row) => row.textContent?.includes('Оплата картой'))!;

    expect(placedRow).toBeDefined();
    expect(placedRow.textContent).toContain(TASKS_TEXTS.detach);
    expect(placedRow.textContent).not.toContain(TASKS_TEXTS.remove);
  });

  it('«вынуть из версии» уходит сразу, без подтверждения', async () => {
    // Обратимое действие: задача остаётся в реестре, и спрашивать
    // согласие на то, что чинится одним нажатием, незачем.
    render(<TasksScreen projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: TASKS_TEXTS.detach }));

    expect(mutateOf(detach)).toHaveBeenCalledWith(PLACED.id);
  });

  it('удаление спрашивает подтверждение и называет потерю целиком', async () => {
    render(<TasksScreen projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: TASKS_TEXTS.remove }));

    expect(screen.getByText(TASKS_TEXTS.removeQuestion)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: TASKS_TEXTS.removeConfirm }));

    expect(mutateOf(remove)).toHaveBeenCalledWith(LOOSE.id);
  });

  it('заводит задачу из панели', async () => {
    render(<TasksScreen projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: TASKS_TEXTS.create }));
    await userEvent.type(screen.getByLabelText('Формулировка'), 'Новая задача');
    await userEvent.click(screen.getByRole('button', { name: 'Завести' }));

    expect(mutateOf(create)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Новая задача' }),
      expect.anything(),
    );
  });

  it('правка уходит в ту задачу, у которой нажали «Править»', async () => {
    render(<TasksScreen projectId={PROJECT_ID} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Править' })[1]!);
    await userEvent.clear(screen.getByLabelText('Формулировка'));
    await userEvent.type(screen.getByLabelText('Формулировка'), 'Оплата картой и СБП');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(mutateOf(update)).toHaveBeenCalledWith(
      { taskId: PLACED.id, input: expect.objectContaining({ title: 'Оплата картой и СБП' }) },
      expect.anything(),
    );
  });

  it('отказ «задача в версии» объясняет, что делать', () => {
    // `task_placed` — не тупик, а действие: сначала вынуть из версии.
    vi.mocked(hooks.useMutationDeleteTask).mockReturnValue(
      mutation({
        error: new ApiError(409, 'Задача стоит в версии', { code: 'task_placed' }),
      }),
    );

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByRole('alert').textContent).toContain('сначала выньте');
  });

  it('о неудаче загрузки говорит словами', () => {
    vi.mocked(hooks.useQueryTasks).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent(TASKS_TEXTS.loadFailed);
  });
});
