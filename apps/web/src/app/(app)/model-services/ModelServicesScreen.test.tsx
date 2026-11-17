import {
  ModelAuthScheme,
  ModelProbeOutcome,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  type ModelServiceSettings,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { ModelServicesScreen } from './ModelServicesScreen';

vi.mock('@/api/hooks');

const SETTINGS: ModelServiceSettings = {
  kind: ModelServiceKind.TaskSuggester,
  source: ModelServiceSource.Database,
  baseUrl: 'https://api.proxyapi.ru/v1',
  host: 'api.proxyapi.ru',
  authScheme: ModelAuthScheme.Bearer,
  model: 'qwen/qwen3-max',
  folder: null,
  placement: ModelServicePlacement.External,
  timeoutSeconds: 60,
  hasSecret: true,
  isEnabled: true,
  isOperational: true,
  blockedBy: null,
  envVarNames: ['CAIRN_TASK_SUGGESTER_API_KEY'],
  hasEnvironmentSettings: false,
  updatedAt: '2026-11-17T10:00:00.000Z',
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
    host: 'api.proxyapi.ru',
    model: 'qwen/qwen3-max',
    durationMs: 120,
  });

  vi.mocked(hooks.useQueryModelServices).mockReturnValue(query([SETTINGS]));
  vi.mocked(hooks.useMutationSaveModelService).mockReturnValue(mutation({ mutateAsync: save }));
  vi.mocked(hooks.useMutationClearModelService).mockReturnValue(mutation({ mutateAsync: clear }));
  vi.mocked(hooks.useMutationProbeModelService).mockReturnValue(mutation({ mutateAsync: probe }));
});

describe('ModelServicesScreen', () => {
  it('показывает карточку узла', () => {
    render(<ModelServicesScreen />);

    expect(screen.getByText('Разбивка саммари на задачи')).toBeInTheDocument();
    expect(screen.getByText('Задано в интерфейсе')).toBeInTheDocument();
  });

  it('результат проверки остаётся на экране и переживает заход в правку', async () => {
    // Всплывающее сообщение здесь не годится: по результату человек
    // правит настройку (дизайн, 12.2). Проверяется «открыл правку и
    // вернулся», а не «видно поверх панели»: панель модальная и прячет
    // страницу от читалок намеренно — исход обязан быть на месте, когда
    // человек из неё вышел.
    render(<ModelServicesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Проверить связь' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Ключ не принят/);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('status')).toHaveTextContent(/Ключ не принят/);
  });

  it('сохранение снимает исход прежней проверки', async () => {
    // Он относился к прежней настройке, и оставить его значило бы выдать
    // старую проверку за проверку новой.
    render(<ModelServicesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Проверить связь' }));
    await userEvent.click(screen.getByRole('button', { name: 'Править' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('правка открывает панель с формой узла', async () => {
    render(<ModelServicesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));

    expect(screen.getByLabelText('Адрес')).toHaveValue('https://api.proxyapi.ru/v1');
  });

  it('сохранение отправляет настройку и закрывает панель', async () => {
    render(<ModelServicesScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));
    await userEvent.clear(screen.getByLabelText('Модель'));
    await userEvent.type(screen.getByLabelText('Модель'), 'другая');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(save).toHaveBeenCalledWith({
      kind: ModelServiceKind.TaskSuggester,
      input: expect.objectContaining({ model: 'другая' }),
    });
    expect(screen.queryByLabelText('Адрес')).toBeNull();
  });

  it('сброс к окружению называет последствие, включая «перестанет работать»', async () => {
    // Администратор может не знать, что переменных на этой установке нет
    // вовсе, и тогда кнопка «вернуть» выглядит безопасной (дизайн, 12.3).
    render(<ModelServicesScreen />);

    await userEvent.click(screen.getByRole('button', { name: /Вернуть настройку окружения/ }));

    expect(screen.getByRole('dialog')).toHaveTextContent(/узел перестанет работать/);
    expect(clear).not.toHaveBeenCalled();
  });

  it('подтверждённый сброс убирает настройку', async () => {
    render(<ModelServicesScreen />);

    await userEvent.click(screen.getByRole('button', { name: /Вернуть настройку окружения/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Да, вернуть' }));

    expect(clear).toHaveBeenCalledWith(ModelServiceKind.TaskSuggester);
  });

  it('о неудаче загрузки говорит словами', () => {
    vi.mocked(hooks.useQueryModelServices).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<ModelServicesScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Не удалось загрузить/);
  });
});
