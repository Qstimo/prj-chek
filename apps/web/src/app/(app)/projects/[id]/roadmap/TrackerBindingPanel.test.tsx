import {
  TRACKER_BASE_URL_MISSING,
  TRACKER_DISABLED,
  TRACKER_NOT_CONFIGURED,
  TRACKER_REJECTED,
  TRACKER_SECRET_MISSING,
  TRACKER_UNAVAILABLE,
  TrackerKind,
  type ProjectTracker,
  type TrackerTargets,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api';
import * as hooks from '@/api/hooks';

import { TrackerBindingPanel } from './TrackerBindingPanel';

vi.mock('@/api/hooks');

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

/** Трекер подключён, привязки у проекта ещё нет. */
const READY: ProjectTracker = { isOperational: true, blockedBy: null, binding: null };

/** Списки целей: имена — людям, идентификаторы — ручке. */
const TARGETS: TrackerTargets = {
  projects: [
    { id: '7', name: 'Платформа' },
    { id: '8', name: 'Маркетинг' },
  ],
  boards: [
    { id: '11', name: 'Спринт', projectId: '7' },
    { id: '12', name: 'Идеи', projectId: '8' },
  ],
  columns: [
    { id: '31', name: 'Бэклог', boardId: '11' },
    { id: '32', name: 'В работе', boardId: '11' },
    { id: '33', name: 'Чужая колонка', boardId: '12' },
  ],
};

const saveBinding = vi.fn();

/** Успешный query-результат для мока. */
function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isPending: false, isError: false, error: null, ...overrides } as never;
}

/** Отказ запроса с кодом из контракта. */
function failed(status: number, code: string) {
  return {
    data: undefined,
    isPending: false,
    isError: true,
    error: new ApiError(status, 'отказ', { code }),
  } as never;
}

beforeEach(() => {
  saveBinding.mockReset();
  vi.mocked(hooks.useQueryProjectTracker).mockReturnValue(query(READY));
  vi.mocked(hooks.useQueryTrackerTargets).mockReturnValue(query(TARGETS));
  vi.mocked(hooks.useMutationSaveTrackerBinding).mockReturnValue({
    mutate: saveBinding,
    mutateAsync: saveBinding,
    isPending: false,
    error: null,
  } as never);
});

describe('TrackerBindingPanel', () => {
  it('показывает причину отказа запроса, не подменяя её ошибкой токена', async () => {
    const message =
      'Обмен с трекером не удался: api.weeek.net — запрос GET /tm/boards отклонён (HTTP 422).';
    vi.mocked(hooks.useQueryTrackerTargets).mockReturnValue(
      query(undefined, {
        isError: true,
        error: new ApiError(502, message, { code: TRACKER_REJECTED }),
      }),
    );
    render(<TrackerBindingPanel projectId={PROJECT_ID} />);
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать доску Weeek' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/токен не принят/)).not.toBeInTheDocument();
  });

  it('при выключенном трекере панели нет вовсе, и сказано почему', async () => {
    // Та же лестница, что у загрузки записи при выключенной расшифровке:
    // кнопки нет, а причина названа — иначе человек ищет её по экрану.
    vi.mocked(hooks.useQueryProjectTracker).mockReturnValue(
      query({ isOperational: false, blockedBy: TRACKER_DISABLED, binding: null }),
    );

    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    expect(screen.queryByRole('button', { name: /Выбрать доску Weeek/ })).toBeNull();
    expect(screen.getByText(/Выключено/)).toBeInTheDocument();
    expect(screen.getByText(/Настройк/)).toBeInTheDocument();
  });

  it('без подключения объясняет, как начать работу с Weeek', () => {
    vi.mocked(hooks.useQueryProjectTracker).mockReturnValue(
      query({ isOperational: false, blockedBy: TRACKER_BASE_URL_MISSING, binding: null }),
    );
    render(<TrackerBindingPanel projectId={PROJECT_ID} />);
    expect(screen.getByText(/Подключите Weeek/)).toBeInTheDocument();
    expect(screen.getByText(/Настройки/)).toBeInTheDocument();
    expect(vi.mocked(hooks.useQueryTrackerTargets)).toHaveBeenCalledWith(PROJECT_ID, false);
  });

  it('показывает привязанную доску и колонку без открытия панели', () => {
    vi.mocked(hooks.useQueryProjectTracker).mockReturnValue(
      query({
        ...READY,
        binding: {
          tracker: TrackerKind.Weeek,
          externalProjectId: '7',
          boardId: '11',
          boardColumnId: '31',
          updatedAt: '2026-11-20T10:00:00.000Z',
          updatedByLabel: null,
        },
      }),
    );
    render(<TrackerBindingPanel projectId={PROJECT_ID} />);
    expect(screen.getByText('Платформа → Спринт → Бэклог')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сменить доску Weeek' })).toBeInTheDocument();
    expect(vi.mocked(hooks.useQueryTrackerTargets)).toHaveBeenCalledWith(PROJECT_ID, true);
    expect(screen.getByText(/каждые 10 минут/)).toBeInTheDocument();
    expect(screen.getByText(/Без правила статус только отображается/)).toBeInTheDocument();
  });

  it('без токена причина названа токеном, а не общим «не настроено»', () => {
    vi.mocked(hooks.useQueryProjectTracker).mockReturnValue(
      query({ isOperational: false, blockedBy: TRACKER_SECRET_MISSING, binding: null }),
    );

    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    expect(screen.getByText(/Нет токена/)).toBeInTheDocument();
  });

  it('списки целей не спрашиваются, пока панель закрыта', () => {
    // За ними стоит живой запрос в трекер с его пределом частоты.
    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    expect(vi.mocked(hooks.useQueryTrackerTargets)).toHaveBeenCalledWith(PROJECT_ID, false);
  });

  it('выбор колонки отправляется идентификаторами, а показывается именами', async () => {
    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: /Выбрать доску Weeek/ }));

    const dialog = screen.getByRole('dialog');

    await userEvent.selectOptions(
      screen.getByLabelText('Проект в Weeek'),
      screen.getByRole('option', { name: 'Платформа' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Доска'),
      screen.getByRole('option', { name: 'Спринт' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Колонка'),
      screen.getByRole('option', { name: 'В работе' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(saveBinding).toHaveBeenCalledWith(
      { externalProjectId: '7', boardId: '11', boardColumnId: '32' },
      expect.anything(),
    );
    // Идентификаторы чужой системы человеку не показываются нигде: имя
    // доски он узнаёт в трекере, а «11» не говорит ему ничего.
    expect(dialog.textContent).not.toMatch(/\b(7|11|32)\b/);
  });

  it('колонки чужой доски в списке не предлагаются', async () => {
    // Каскад — не украшение: колонка принадлежит доске, и выбранная из
    // чужой доски уехала бы в трекер отказом, который человек увидел бы
    // позже и в другом месте.
    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: /Выбрать доску Weeek/ }));
    await userEvent.selectOptions(
      screen.getByLabelText('Проект в Weeek'),
      screen.getByRole('option', { name: 'Платформа' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Доска'),
      screen.getByRole('option', { name: 'Спринт' }),
    );

    expect(screen.queryByRole('option', { name: 'Чужая колонка' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Идеи' })).toBeNull();
  });

  it('неполная привязка не сохраняется', async () => {
    // Половина привязки — то же «куда-нибудь», от которого привязка и
    // спасает (контракт, `trackerBindingUpdateSchema`).
    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: /Выбрать доску Weeek/ }));
    await userEvent.selectOptions(
      screen.getByLabelText('Проект в Weeek'),
      screen.getByRole('option', { name: 'Платформа' }),
    );

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(saveBinding).not.toHaveBeenCalled();
  });

  it('смена готовой привязки спрашивает подтверждение и называет потерю', async () => {
    // Уже выгруженные задачи останутся на прежней доске: перенести их мы
    // не можем, и узнать об этом человек обязан до смены, а не после.
    vi.mocked(hooks.useQueryProjectTracker).mockReturnValue(
      query({
        isOperational: true,
        blockedBy: null,
        binding: {
          tracker: TrackerKind.Weeek,
          externalProjectId: '7',
          boardId: '11',
          boardColumnId: '31',
          updatedAt: '2026-11-20T10:00:00.000Z',
          updatedByLabel: 'владелец@cairn.local',
        },
      }),
    );

    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: /Сменить доску Weeek/ }));
    await userEvent.selectOptions(
      screen.getByLabelText('Колонка'),
      screen.getByRole('option', { name: 'В работе' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(saveBinding).not.toHaveBeenCalled();
    expect(screen.getByText(/останутся на прежней доске/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Да, сменить' }));

    expect(saveBinding).toHaveBeenCalledWith(
      { externalProjectId: '7', boardId: '11', boardColumnId: '32' },
      expect.anything(),
    );
  });

  it('отказ «трекер не подключён» объясняется словами, а не кодом', async () => {
    // Код интерфейс разбирает, человеку он не говорит ничего. Слова здесь
    // свои, а не те же, что на экране настроек: подрядчик это подключение
    // не правит, и ему назван тот, кто правит.
    vi.mocked(hooks.useQueryTrackerTargets).mockReturnValue(failed(409, TRACKER_NOT_CONFIGURED));

    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: /Выбрать доску Weeek/ }));

    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent(/не подключ/i);
    expect(alert).toHaveTextContent(/администратор/i);
    expect(alert.textContent).not.toContain(TRACKER_NOT_CONFIGURED);
  });

  it('молчание трекера отличается от отказа трекера', async () => {
    // «Не ответил» лечится повтором, «отказал» — правкой настройки, и
    // одна фраза на оба случая отправила бы человека делать не то.
    vi.mocked(hooks.useQueryTrackerTargets).mockReturnValue(failed(502, TRACKER_UNAVAILABLE));

    render(<TrackerBindingPanel projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByRole('button', { name: /Выбрать доску Weeek/ }));

    expect(screen.getByRole('alert')).toHaveTextContent(/не ответил/i);
  });
});
