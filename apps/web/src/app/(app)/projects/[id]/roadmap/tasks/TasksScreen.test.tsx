import {
  MAX_TASK_EXPORT_BATCH,
  TRACKER_BASE_URL_MISSING,
  TRACKER_REJECTED,
  TRACKER_SECRET_MISSING,
  TRACKER_UNAVAILABLE,
  TaskExportOutcome,
  TaskOrigin,
  TrackerKind,
  type ProjectTask,
  type TaskExport,
  type TaskExportResult,
  type TrackerBinding,
} from '@cairn/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api';
import * as hooks from '@/api/hooks';

import { TasksScreen } from './TasksScreen';
import { EXPORT_FAILURES, EXPORT_TEXTS, TASKS_TEXTS } from './constants';

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
  export: null,
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

/**
 * Зеркало удачной выгрузки: задача уехала и там открыта.
 *
 * `externalUrl` отличается от `url` задачи намеренно: вписанную человеком
 * ссылку выгрузка не перезаписывает (дизайн, 3.1), и на экране это две
 * разные ссылки.
 */
const EXPORT: TaskExport = {
  tracker: TrackerKind.Weeek,
  externalId: '4242',
  externalUrl: 'https://app.weeek.net/ws/1/task/4242',
  externalBoardId: '11',
  externalColumnId: '31',
  isCompleted: false,
  exportedAt: '2026-11-21T08:00:00.000Z',
  updatedAt: '2026-11-21T08:00:00.000Z',
  checkedAt: '2026-11-21T09:00:00.000Z',
  failureCode: null,
};

/** Третья задача: набор из трёх нужен, чтобы «не пробовали» было больше одной. */
const THIRD: ProjectTask = {
  ...LOOSE,
  id: '77777777-7777-7777-7777-777777777777',
  title: 'Выгрузка в трекер',
};

/** Привязка доски: без неё выгружать некуда. */
const BINDING: TrackerBinding = {
  tracker: TrackerKind.Weeek,
  externalProjectId: '7',
  boardId: '11',
  boardColumnId: '31',
  updatedAt: '2026-11-21T08:00:00.000Z',
  updatedByLabel: null,
};

/** Задача с зеркалом выгрузки: поля правятся по одному. */
function withExport(task: ProjectTask, patch: Partial<TaskExport> = {}): ProjectTask {
  return { ...task, export: { ...EXPORT, ...patch } };
}

/** Итог выгрузки по одной задаче так, как его отдаёт ручка. */
function resultOf(
  task: ProjectTask,
  outcome: TaskExportOutcome,
  failureCode: string | null = null,
): TaskExportResult {
  return { taskId: task.id, outcome, failureCode, export: task.export };
}

/**
 * Выгрузка, которая уже ответила итогом.
 *
 * `mutate` зовёт `onSuccess` сам: отметки снимаются именно там, и мок,
 * который этого не делает, проверял бы не поведение экрана, а своё
 * умолчание.
 */
function exported(results: TaskExportResult[]): void {
  vi.mocked(hooks.useMutationExportTasks).mockReturnValue(
    mutation({
      data: results,
      mutate: vi.fn((_ids: string[], options?: { onSuccess?: (data: TaskExportResult[]) => void }) =>
        options?.onSuccess?.(results),
      ),
    }),
  );
}

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
const exportTasks = mutation();

/** Шпион `mutate`: моки объявлены как `never`. */
function mutateOf(stub: unknown): ReturnType<typeof vi.fn> {
  return (stub as { mutate: ReturnType<typeof vi.fn> }).mutate;
}

/**
 * Состояние трекера на установке.
 *
 * Умолчание в `beforeEach` — установка без трекера: его отсутствие ничем на
 * экране не названо, и этим же состоянием проверяется, что колонки выгрузки
 * при нём нет вовсе.
 */
function tracker(data: {
  isOperational: boolean;
  blockedBy: string | null;
  binding: TrackerBinding | null;
}): void {
  vi.mocked(hooks.useQueryProjectTracker).mockReturnValue(query(data));
}

/** Трекер подключён и доска привязана: выгрузка возможна. */
function ready(): void {
  tracker({ isOperational: true, blockedBy: null, binding: BINDING });
}

beforeEach(() => {
  replace.mockReset();
  mutateOf(exportTasks).mockReset();
  mutateOf(update).mockReset();
  mutateOf(detach).mockReset();
  mutateOf(remove).mockReset();
  mutateOf(create).mockReset();
  search.value = '';
  vi.mocked(hooks.useQueryTasks).mockReturnValue(query([LOOSE, PLACED]));
  vi.mocked(hooks.useQueryPlatforms).mockReturnValue(query([]));
  vi.mocked(hooks.useMutationCreateTask).mockReturnValue(create);
  vi.mocked(hooks.useMutationUpdateTask).mockReturnValue(update);
  vi.mocked(hooks.useMutationDeleteTask).mockReturnValue(remove);
  vi.mocked(hooks.useMutationDetachTask).mockReturnValue(detach);
  vi.mocked(hooks.useMutationExportTasks).mockReturnValue(exportTasks);
  // Панель «Куда выгружать» читает готовность трекера на рендере:
  // автомок отдал бы `undefined` и уронил бы экран. Умолчание —
  // установка без трекера: о нём на экране задач не сказано ничего.
  tracker({ isOperational: false, blockedBy: TRACKER_BASE_URL_MISSING, binding: null });
  vi.mocked(hooks.useQueryTrackerTargets).mockReturnValue(
    query({ projects: [], boards: [], columns: [] }),
  );
  vi.mocked(hooks.useMutationSaveTrackerBinding).mockReturnValue(mutation());
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

  it('на установке без трекера о выгрузке не сказано ничего', () => {
    // Та же лестница, что у загрузки записи при выключенной расшифровке:
    // установка без трекера полностью рабочая, задачи ведутся здесь.
    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.queryByRole('button', { name: /Куда выгружать/ })).toBeNull();
  });

  it('привязка доски живёт рядом с задачами, а не на экране версий', () => {
    // «Куда уедут задачи» спрашивают, глядя на сами задачи.
    tracker({ isOperational: true, blockedBy: null, binding: null });

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByRole('button', { name: /Куда выгружать/ })).toBeInTheDocument();
  });
});

describe('выгрузка задач и зеркало трекера', () => {
  it('при выключенном трекере ни кнопки, ни колонки, ни отметок нет вовсе', () => {
    // Та же лестница, что у загрузки записи при выключенной расшифровке:
    // установка без трекера полностью рабочая, и колонка «Выгрузка», в
    // которой у каждой строки написано «не выгружена», была бы укором за
    // решение, которого никто не принимал.
    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.queryByRole('button', { name: EXPORT_TEXTS.action })).toBeNull();
    expect(screen.queryByText(EXPORT_TEXTS.column)).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('невыгруженная задача сказана словами, а не пустой клеткой', () => {
    // Пустая клетка читается как «не знаю»: человек идёт искать, почему
    // статус не пришёл, вместо того чтобы нажать «Выгрузить».
    ready();

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getAllByText(EXPORT_TEXTS.none)).toHaveLength(2);
  });

  it('выгруженная называет, когда спрашивали статус', () => {
    // Статус запаздывает на интервал опроса — вебхуков у Weeek нет
    // (дизайн, 10.2), — и без времени опроса бирка утверждала бы, что
    // зеркало свежее.
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([withExport(LOOSE)]));

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByText(EXPORT_TEXTS.exported)).toBeInTheDocument();
    expect(
      screen.getByText(EXPORT_TEXTS.checkedAt(new Date(EXPORT.checkedAt!).toLocaleString('ru-RU'))),
    ).toBeInTheDocument();
  });

  it('не выдаёт «ещё не спрашивали» за «не менялось»', () => {
    // Та же ошибка, что аптайм без пропусков наблюдения: пустой `checkedAt`
    // означает ровно «опроса не было», и молчание об этом читалось бы как
    // «спросили, и всё по-прежнему».
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([withExport(LOOSE, { checkedAt: null })]));

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByText(EXPORT_TEXTS.checkedNever)).toBeInTheDocument();
  });

  it('закрытая и там, и здесь — согласие, а не расхождение', () => {
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(
      query([
        {
          ...withExport(PLACED, { isCompleted: true }),
          placement: { ...PLACED.placement!, isDone: true },
        },
      ]),
    );

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByText(EXPORT_TEXTS.completedThere)).toBeInTheDocument();
    expect(screen.queryByText(EXPORT_TEXTS.divergent)).toBeNull();
  });

  it('расхождение названо биркой, и ничего само не закрывает', () => {
    // Решение владельца (дизайн, 5): чекпоинт закрывает человек, прогресс
    // версии считается только из чекпоинтов. Автоматическое закрытие
    // означало бы, что упавший опрос или снятый токен молча останавливают
    // прогресс роадмапа, — поэтому показ расхождения не делает ни одного
    // вызова правки.
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(
      query([withExport(PLACED, { isCompleted: true })]),
    );

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByText(EXPORT_TEXTS.divergent)).toBeInTheDocument();
    expect(mutateOf(update)).not.toHaveBeenCalled();
    expect(mutateOf(detach)).not.toHaveBeenCalled();
    expect(mutateOf(exportTasks)).not.toHaveBeenCalled();
  });

  it('«обмен не удался» называет код словами', () => {
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(
      query([withExport(LOOSE, { failureCode: TRACKER_UNAVAILABLE })]),
    );

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(
      screen.getByText(EXPORT_TEXTS.failed(EXPORT_FAILURES[TRACKER_UNAVAILABLE]!)),
    ).toBeInTheDocument();
  });

  it('незнакомый код отказа показывается как есть, а не прячется', () => {
    // Код без фразы в карте — всё равно ответ: он ищется в журнале и в
    // логе, а «обмен не удался» без кода не ищется нигде.
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(
      query([withExport(LOOSE, { failureCode: 'weeek_said_no' })]),
    );

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByText(EXPORT_TEXTS.failed('weeek_said_no'))).toBeInTheDocument();
  });

  it('ссылка в трекер лежит своим слоем над областью выбора', () => {
    // Иначе она утонула бы под растянутой на строку областью отметки:
    // приём уже применён в истории саммари и в сводке проектов.
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([withExport(LOOSE)]));

    render(<TasksScreen projectId={PROJECT_ID} />);

    const link = screen.getByRole('link', { name: EXPORT_TEXTS.open });

    expect(link).toHaveAttribute('href', EXPORT.externalUrl);
    expect(link.className).toContain('relative');
  });

  it('уезжают только отмеченные задачи', async () => {
    ready();

    render(<TasksScreen projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('checkbox', { name: EXPORT_TEXTS.select(LOOSE.title) }));
    await userEvent.click(screen.getByRole('button', { name: EXPORT_TEXTS.action }));

    expect(mutateOf(exportTasks)).toHaveBeenCalledWith([LOOSE.id], expect.anything());
  });

  it('отметка скрытой фильтром задачи не уезжает молча', async () => {
    // Человек отметил, переключил фильтр и видит одну строку: уехавшая
    // вместе с ней невидимая задача была бы правкой в чужом трекере, о
    // которой на экране не сказано ничего.
    ready();

    const { rerender } = render(<TasksScreen projectId={PROJECT_ID} />);

    await userEvent.click(
      screen.getByRole('checkbox', { name: EXPORT_TEXTS.select(PLACED.title) }),
    );
    search.value = 'loose=true';
    rerender(<TasksScreen projectId={PROJECT_ID} />);
    await userEvent.click(screen.getByRole('checkbox', { name: EXPORT_TEXTS.select(LOOSE.title) }));
    await userEvent.click(screen.getByRole('button', { name: EXPORT_TEXTS.action }));

    expect(mutateOf(exportTasks)).toHaveBeenCalledWith([LOOSE.id], expect.anything());
  });

  it('итог удачной выгрузки назван числами', () => {
    // Числа, а не «готово»: исход у набора не один, и «что уехало» —
    // единственный вопрос, с которым человек смотрит на экран после
    // нажатия. Ноль назван словом, а не промолчан: промолчанный ноль
    // читается как «неизвестно».
    // Числа у исходов разные намеренно: равные не отличили бы «заведено»
    // от «исправлено», а это два разных события и в трекере, и в журнале
    // (`task.exported` против `task.export_updated`).
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(
      query([withExport(LOOSE), withExport(PLACED), withExport(THIRD)]),
    );
    exported([
      resultOf(LOOSE, TaskExportOutcome.Created),
      resultOf(THIRD, TaskExportOutcome.Created),
      resultOf(PLACED, TaskExportOutcome.Updated),
    ]);

    render(<TasksScreen projectId={PROJECT_ID} />);

    const summary = screen.getByRole('status').textContent ?? '';

    expect(summary).toContain('заведено 2');
    expect(summary).toContain('исправлено 1');
    expect(summary).toContain('не вышло 0');
    expect(summary).toContain('не пробовали 0');
  });

  it('отказ на первой задаче из трёх назван словами и называет недошедшие', () => {
    // Сервер отвечает `201` и когда обмен не удался: без чтения тела
    // баннера не было вовсе, и задача оставалась «Не выгружена» без
    // единого слова о том, почему. «Не пробовали» обязано быть объяснено —
    // иначе непонятно, что остальные задачи целы и повтор осмыслен.
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([LOOSE, PLACED, THIRD]));
    exported([
      resultOf(LOOSE, TaskExportOutcome.Failed, TRACKER_UNAVAILABLE),
      resultOf(PLACED, TaskExportOutcome.Skipped),
      resultOf(THIRD, TaskExportOutcome.Skipped),
    ]);

    render(<TasksScreen projectId={PROJECT_ID} />);

    const summary = screen.getByRole('status').textContent ?? '';

    expect(summary).toContain('не вышло 1');
    expect(summary).toContain('не пробовали 2');
    expect(summary).toContain(EXPORT_TEXTS.skippedWhy);
  });

  it('недошедшие задачи без единого отказа отказом не объясняются', () => {
    // «Не пробовали» бывает по трём причинам: набор остановился на отказе,
    // упёрся в предел времени (`EXPORT_BATCH_BUDGET_MS`) или задачу унесли,
    // пока он шёл. Исход у них один намеренно — он говорит о задаче, а не о
    // причине, — но объяснение, называющее отказ там, где не отказал никто,
    // отправляет человека искать несуществующую беду с трекером: он пойдёт
    // проверять токен и доску вместо того, чтобы просто повторить.
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([LOOSE, PLACED, THIRD]));
    exported([
      resultOf(LOOSE, TaskExportOutcome.Created),
      resultOf(PLACED, TaskExportOutcome.Skipped),
      resultOf(THIRD, TaskExportOutcome.Skipped),
    ]);

    render(<TasksScreen projectId={PROJECT_ID} />);

    const summary = screen.getByRole('status').textContent ?? '';

    expect(summary).toContain('не пробовали 2');
    expect(summary).not.toContain('отказ');
    // Сказать о них всё равно обязаны: молчание о двух недошедших задачах
    // читается как «уехали все три».
    expect(summary).toContain(EXPORT_TEXTS.skippedWhyBudget);
  });

  it('итог, который не разобрался, назван на экране его же словами', () => {
    // Последняя миля того же дефекта: нечитаемое тело итога мутация отдаёт
    // обычной `Error` с названной фразой (`useMutationExportTasks`), и
    // показать её обязан экран. Такой отказ не `ApiError`, кода у него нет, и
    // `summaryFailureOf` о нём не скажет ничего — то есть он проходит не тем
    // путём, которым идут отказы ручки, и проглоти экран этот путь, человек
    // снова остался бы без слова о том, что случилось с набором. Фраза здесь
    // своя, а не импортированная: она приватна хуку намеренно, и сторожится
    // здесь не её текст, а то, что текст доезжает.
    ready();
    vi.mocked(hooks.useMutationExportTasks).mockReturnValue(
      mutation({ error: new Error('Выгрузка ушла, но её итог не разобран') }),
    );

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByRole('alert').textContent).toContain('итог не разобран');
  });

  it('причина отказа видна в строке задачи, у которой зеркала нет вовсе', () => {
    // При первом неудачном обмене строки зеркала не возникает (контракт,
    // `taskExportResultSchema`), и реестр о неудаче не знает ничего:
    // причину приносит итог выгрузки, иначе её не узнать нигде.
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([LOOSE, PLACED]));
    exported([
      resultOf(LOOSE, TaskExportOutcome.Failed, TRACKER_REJECTED),
      resultOf(PLACED, TaskExportOutcome.Skipped),
    ]);

    render(<TasksScreen projectId={PROJECT_ID} />);

    const row = screen.getAllByRole('row').find((it) => it.textContent?.includes(LOOSE.title))!;

    expect(row.textContent).toContain(EXPORT_FAILURES[TRACKER_REJECTED]);
    // Код как есть показывается только тому, у кого фразы нет: `tracker_rejected`
    // в строке означал бы, что карта фраз мимо этого пути.
    expect(row.textContent).not.toContain(TRACKER_REJECTED);
    // Недошедшая задача ничего о себе не сообщает: с ней не произошло
    // ничего, и бирка отказа у неё была бы неправдой.
    const skipped = screen.getAllByRole('row').find((it) => it.textContent?.includes(PLACED.title))!;

    expect(skipped.textContent).not.toContain(EXPORT_TEXTS.failed(''));
  });

  it('отметки неудавшихся задач остаются, а уехавших снимаются', () => {
    // Повтор — ровно то действие, которое человек сделает следующим, и
    // снятая отметка заставила бы его искать те же строки заново. У
    // уехавшей задачи отметка наоборот снимается: повторная выгрузка
    // правит задачу в чужом трекере (дизайн, 6).
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([LOOSE, PLACED]));
    exported([
      resultOf(LOOSE, TaskExportOutcome.Failed, TRACKER_UNAVAILABLE),
      resultOf(PLACED, TaskExportOutcome.Created),
    ]);

    render(<TasksScreen projectId={PROJECT_ID} />);

    for (const box of screen.getAllByRole('checkbox')) {
      fireEvent.click(box);
    }

    fireEvent.click(screen.getByRole('button', { name: EXPORT_TEXTS.action }));

    expect(screen.getByRole('checkbox', { name: EXPORT_TEXTS.select(LOOSE.title) })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: EXPORT_TEXTS.select(PLACED.title) }),
    ).not.toBeChecked();
  });

  it('полная формулировка читается, а не прячется под подсказкой', () => {
    // Область отметки растянута на всю строку (`after:inset-0`) и
    // перехватывает курсор: подсказка `title` под ней не всплывает никогда,
    // а колонка формулировки сузилась до трети строки, когда появилась
    // колонка выгрузки. Поэтому формулировка переносится по словам и видна
    // целиком — подсказка не была бы доступна ни с клавиатуры, ни на
    // телефоне.
    ready();

    const long = `${'Поднять предел текста до созвона и не закрывать панель броском '.repeat(3)}конец`;

    vi.mocked(hooks.useQueryTasks).mockReturnValue(query([{ ...LOOSE, title: long }]));

    render(<TasksScreen projectId={PROJECT_ID} />);

    const title = screen.getByText(long);

    expect(title.className).not.toContain('truncate');
    expect(title.className).toContain('break-words');
  });

  it('без отметок кнопка не нажимается, и причина названа', () => {
    ready();

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByRole('button', { name: EXPORT_TEXTS.action })).toBeDisabled();
    expect(screen.getByText(EXPORT_TEXTS.nothingSelected)).toBeInTheDocument();
  });

  it('без привязки доски кнопка не нажимается, и причина названа', () => {
    // Чинится на этом же экране, панелью выше: молчание отправило бы
    // человека к администратору за тем, что он делает сам.
    tracker({ isOperational: true, blockedBy: null, binding: null });

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByRole('button', { name: EXPORT_TEXTS.action })).toBeDisabled();
    expect(screen.getByText(EXPORT_TEXTS.bindingMissing)).toBeInTheDocument();
  });

  it('при неработающем подключении кнопка не нажимается, и причина названа', () => {
    // Подключение начато и не работает — об этом сказано: его кто-то
    // настраивал и ждёт, что выгрузка работает.
    tracker({ isOperational: false, blockedBy: TRACKER_SECRET_MISSING, binding: BINDING });

    render(<TasksScreen projectId={PROJECT_ID} />);

    expect(screen.getByRole('button', { name: EXPORT_TEXTS.action })).toBeDisabled();
    expect(screen.getByText(EXPORT_TEXTS.blocked)).toBeInTheDocument();
  });

  it('набор больше предела не уходит молча', () => {
    // Предел — время ответа нашей ручки: выгрузка идёт по запросу на
    // задачу и последовательно (контракт, `MAX_TASK_EXPORT_BATCH`), и
    // оборванный по таймауту набор не сказал бы, сколько уже уехало.
    ready();
    vi.mocked(hooks.useQueryTasks).mockReturnValue(
      query(
        Array.from({ length: MAX_TASK_EXPORT_BATCH + 1 }, (_, index) => ({
          ...LOOSE,
          id: `6666666${index.toString().padStart(2, '0')}-6666-6666-6666-666666666666`,
          title: `Задача ${index}`,
        })),
      ),
    );

    render(<TasksScreen projectId={PROJECT_ID} />);

    // `fireEvent`, а не `userEvent`: пятьдесят одна отметка через полную
    // симуляцию указателя перерисовывает таблицу пятьдесят один раз и не
    // укладывается в предел теста. Проверяется здесь не способ нажатия, а
    // что набор сверх предела не уходит молча.
    for (const box of screen.getAllByRole('checkbox')) {
      fireEvent.click(box);
    }

    expect(screen.getByRole('button', { name: EXPORT_TEXTS.action })).toBeDisabled();
    expect(screen.getByText(EXPORT_TEXTS.tooMany(MAX_TASK_EXPORT_BATCH))).toBeInTheDocument();
    // Единственный в вебе тест со своим пределом ожидания, и это не
    // послабление, а цена самого утверждения: предел набора — пятьдесят, то
    // есть проверить его нечем, кроме пятидесяти одной отметки, а каждая
    // отметка перерисовывает таблицу из пятидесяти одной строки. Измерено:
    // отрисовка 140 мс, поиск отметок 181 мс, сами отметки 1657 мс — то
    // есть две трети пятисекундного умолчания уходит на работу, которая
    // честно нужна. Умолчание было пройдено один раз в общем прогоне, когда
    // рядом шли интеграционные тесты API, и ответ на это — назвать предел,
    // а не ослабить утверждение: отметок меньше предела набора не бывает.
    // Собрать их одним `act` не выходит — React сбрасывает щелчок
    // синхронно, и вложенный `act` на это не влияет (проверено: те же
    // 1,9 с).
  }, 30_000);
});
