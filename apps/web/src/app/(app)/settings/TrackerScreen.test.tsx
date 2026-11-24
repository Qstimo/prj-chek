import {
  ModelProbeOutcome,
  TRACKER_NOT_CONFIGURED,
  TRACKER_SECRET_MISSING,
  TrackerKind,
  type TrackerConnection,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api';
import * as hooks from '@/api/hooks';

import { TrackerScreen } from './TrackerScreen';

vi.mock('@/api/hooks');

/** Свежая установка: ни адреса, ни токена. */
const EMPTY: TrackerConnection = {
  kind: TrackerKind.Weeek,
  baseUrl: '',
  workspaceId: null,
  hasSecret: false,
  isEnabled: false,
  isOperational: false,
  blockedBy: TRACKER_SECRET_MISSING,
  updatedAt: null,
  updatedByLabel: null,
};

/** Настроенное подключение. */
const CONNECTION: TrackerConnection = {
  ...EMPTY,
  baseUrl: 'https://api.weeek.net/public/v1',
  workspaceId: '42',
  hasSecret: true,
  isEnabled: true,
  isOperational: true,
  blockedBy: null,
  updatedAt: '2026-11-20T10:00:00.000Z',
  updatedByLabel: 'админ@cairn.local',
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    ...overrides,
  } as never;
}

const save = vi.fn();
const clear = vi.fn();
const probe = vi.fn();

beforeEach(() => {
  save.mockReset();
  clear.mockReset();
  probe.mockReset();
  probe.mockResolvedValue({
    outcome: ModelProbeOutcome.Unauthorized,
    status: 401,
    host: 'api.weeek.net',
    durationMs: 120,
  });

  vi.mocked(hooks.useQueryTrackerConnection).mockReturnValue(query(CONNECTION));
  vi.mocked(hooks.useMutationSaveTrackerConnection).mockReturnValue(mutation({ mutateAsync: save }));
  vi.mocked(hooks.useMutationClearTrackerConnection).mockReturnValue(
    mutation({ mutateAsync: clear }),
  );
  vi.mocked(hooks.useMutationProbeTracker).mockReturnValue(mutation({ mutateAsync: probe }));
});

describe('TrackerScreen', () => {
  it('ответ без токена не роняет карточку', () => {
    // Свежая установка — обычное состояние, а не сбой: карточка обязана
    // показать, что подключение существует и не настроено.
    vi.mocked(hooks.useQueryTrackerConnection).mockReturnValue(query(EMPTY));

    render(<TrackerScreen />);

    expect(screen.getByRole('heading', { name: 'Weeek' })).toBeInTheDocument();
    expect(screen.getByText('Нет токена')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('исход проверки связи остаётся рядом с карточкой', async () => {
    render(<TrackerScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Проверить связь' }));

    expect(screen.getByRole('status')).toHaveTextContent(/Токен не принят/);
  });

  it('сохранение снимает исход прежней проверки', async () => {
    // Он относился к прежней настройке, и оставить его значило бы выдать
    // старую проверку за проверку новой.
    render(<TrackerScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Проверить связь' }));
    await userEvent.click(screen.getByRole('button', { name: 'Настроить подключение' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('правка открывает панель с формой подключения', async () => {
    render(<TrackerScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Настроить подключение' }));

    expect(screen.queryByLabelText('Адрес')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Токен')).toHaveValue('');
    expect(screen.getByLabelText('Токен')).toHaveValue('');
  });

  it('снятие подключения называет последствие и само ничего не уносит', async () => {
    // Выгрузки уедут вместе с подключением, а задачи останутся: о потере
    // сказано до нажатия, а не после.
    render(<TrackerScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать подключение' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(/выгрузк/i);
    expect(clear).not.toHaveBeenCalled();
  });

  it('подтверждённое снятие убирает подключение', async () => {
    render(<TrackerScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать подключение' }));
    await userEvent.click(screen.getByRole('button', { name: 'Да, убрать' }));

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('отказ «трекер не подключён» объясняется словами, а не кодом', async () => {
    // Код интерфейс разбирает, человеку он не говорит ничего: на экране
    // стоит действие — впишите адрес и токен.
    probe.mockRejectedValue(
      new ApiError(409, 'Трекер не настроен', { code: TRACKER_NOT_CONFIGURED }),
    );
    vi.mocked(hooks.useMutationProbeTracker).mockReturnValue(
      mutation({
        mutateAsync: probe,
        error: new ApiError(409, 'Трекер не настроен', { code: TRACKER_NOT_CONFIGURED }),
      }),
    );

    render(<TrackerScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent(/впишите адрес и токен/i);
    expect(screen.getByRole('alert').textContent).not.toContain(TRACKER_NOT_CONFIGURED);
  });

  it('о неудаче загрузки говорит словами', () => {
    vi.mocked(hooks.useQueryTrackerConnection).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<TrackerScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Не удалось загрузить/);
  });
});
