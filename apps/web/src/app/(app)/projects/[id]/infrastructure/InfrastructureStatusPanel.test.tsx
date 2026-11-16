import {
  HealthState,
  StatusCheckCode,
  StatusIndicator,
  StatusWarningKind,
  type DomainStatus,
  type ProjectStatus,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';
import { ApiError } from '@/api/errors';

import { InfrastructureStatusPanel } from './InfrastructureStatusPanel';

vi.mock('@/api/hooks');

const ENVIRONMENT_ID = '11111111-1111-1111-1111-111111111111';
const DOMAIN_ID = '22222222-2222-2222-2222-222222222222';

const ADDRESS: DomainStatus = {
  domainId: DOMAIN_ID,
  environmentId: ENVIRONMENT_ID,
  name: 'stage.example.com',
  health: HealthState.Down,
  latencyMs: null,
  healthError: 'порт закрыт (ECONNREFUSED)',
  healthCode: StatusCheckCode.ConnectionRefused,
  redirectTo: null,
  resolvedIp: '203.0.113.10',
  resolvedIps: ['203.0.113.10'],
  resolveError: null,
  tlsValidTo: '2027-01-01T00:00:00.000Z',
  tlsTrusted: true,
  tlsCode: null,
  tlsError: null,
  registryExpiresAt: '2027-06-01T00:00:00.000Z',
  registryError: null,
  checkedAt: '2026-09-17T10:00:00.000Z',
};

const STATUS: ProjectStatus = {
  indicator: StatusIndicator.Down,
  environments: [
    {
      environmentId: ENVIRONMENT_ID,
      name: 'Прод',
      health: HealthState.Down,
      checkedAt: '2026-09-17T10:00:00.000Z',
    },
  ],
  domains: [ADDRESS],
  warnings: [
    {
      kind: StatusWarningKind.HealthDown,
      subject: 'stage.example.com',
      detail: 'порт закрыт (ECONNREFUSED)',
      code: StatusCheckCode.ConnectionRefused,
    },
    {
      kind: StatusWarningKind.TlsExpiring,
      subject: 'stage.example.com',
      detail: 'TLS истекает 2026-10-01',
      days: 10,
      threshold: 14,
      date: '2026-10-01',
    },
  ],
  registryWarnings: [
    {
      kind: StatusWarningKind.ServerExpiring,
      subject: 'hetzner-fsn-1',
      detail: 'оплачен до 2026-10-01',
      days: 10,
      threshold: 14,
      date: '2026-10-01',
    },
  ],
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), isPending: false, isSuccess: false, error: null } as never;
}

beforeEach(() => {
  vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(query(STATUS));
  vi.mocked(hooks.useQueryIncidents).mockReturnValue(query([]));
  vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue(query(null));
  vi.mocked(hooks.useMutationRunChecks).mockReturnValue(mutation());
});

describe('панель статуса инфраструктуры', () => {
  it.each([StatusIndicator.Warning, StatusIndicator.Unknown, StatusIndicator.Paused])('сохраняет доступный запуск рядом с индикатором %s', async (indicator) => {
    const mutate = vi.fn();
    vi.mocked(hooks.useMutationRunChecks).mockReturnValue({ mutate, isPending: false, isSuccess: false, error: null } as never);
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(query({ ...STATUS, indicator }));
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);
    await userEvent.click(screen.getByRole('button', { name: 'Проверить сейчас' }));
    expect(mutate).toHaveBeenCalledOnce();
  });
  it.each([true, false])('адрес без первой проверки не обещает отсутствие падений (running=%s)', (checkRunning) => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(query({ ...STATUS, checkRunning, warnings: [], registryWarnings: [], domains: [{ ...ADDRESS, checkedAt: null, health: null, healthError: null, latencyMs: null, tlsTrusted: null, tlsValidTo: null, registryExpiresAt: null }] }));
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);
    expect(screen.getByText(/Наблюдение ещё не началось/)).toBeInTheDocument();
    expect(screen.getByText(/данных для графика нет/)).toBeInTheDocument();
    expect(screen.queryByText(/Зарегистрированных падений за/)).not.toBeInTheDocument();
    expect(screen.queryByText(/никогда|не проверяли/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Проверки выполняются…') !== null).toBe(checkRunning);
    if (checkRunning) expect(screen.getByRole('button', { name: 'Проверяю…' })).toBeDisabled();
    else expect(screen.getByRole('button', { name: 'Проверить сейчас' })).toBeEnabled();
  });
  it('после reload показывает непрерывный Loader до подтверждённого сервером завершения', () => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(query({ ...STATUS, checkRunning: true }));
    const { rerender } = render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);
    expect(screen.getByText('Проверки выполняются…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проверяю…' })).toBeDisabled();
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(query({ ...STATUS, checkRunning: false }));
    rerender(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);
    expect(screen.queryByText('Проверки выполняются…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проверить сейчас' })).toBeEnabled();
  });

  it('потеря сети во время прогона не прячет Loader и не разрешает повторный запуск', () => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue({ data: { ...STATUS, checkRunning: true }, isPending: false, isError: true } as never);
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);
    expect(screen.getByText('Проверки выполняются…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проверяю…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/завершение проверок пока не подтверждено/);
  });
  it.each(['pending', 'error'])('не выдаёт %s истории за отсутствие падений', (state) => {
    vi.mocked(hooks.useQueryIncidents).mockReturnValue({ data: undefined,
      isPending: state === 'pending', isError: state === 'error',
    } as never);
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />);
    expect(screen.queryByText(/Падений за .* не было/)).not.toBeInTheDocument();
    expect(screen.getByText(state === 'pending' ? 'Загрузка истории падений…' : 'Не удалось загрузить историю падений.')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: ADDRESS.name })).toBeInTheDocument();
  });

  it('при отказе обновления сохраняет известное падение и предупреждает об устаревшей истории', () => {
    vi.mocked(hooks.useQueryIncidents).mockReturnValue({ isPending: false, isError: true,
      data: [{ domainId: DOMAIN_ID, name: ADDRESS.name, windowDays: 30, fallsInWindow: 1,
        open: { id: 'incident', domainId: DOMAIN_ID, startedAt: ADDRESS.checkedAt, resolvedAt: null, cause: 'HTTP 500' }, past: [],
      }],
    } as never);
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/ранее загруженные данные/);
    expect(screen.getByRole('list', { name: 'Падения адресов' })).toHaveTextContent(ADDRESS.name);
    expect(screen.queryByText(/Падений за .* не было/)).not.toBeInTheDocument();
  });

  it('загрузку показывает, а не гасит', () => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never);

    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />);

    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
  });

  it('отказ объясняет, а не оставляет пустое место', () => {
    // Прежде загрузка, ошибка и отсутствие доступа гасились одним
    // `return null`: при 500 человек с доступом не видел ничего.
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/статус/i);
  });

  it('без доступа к секции не рисует ничего', () => {
    // 404 и 403 превращаются в `null`: существование секции не
    // раскрывается (ТЗ 4.2).
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(query(null));

    const { container } = render(
      <InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('пустую инфраструктуру объясняет словами', () => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(
      query({ ...STATUS, environments: [], domains: [], warnings: [], registryWarnings: [] }),
    );

    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />);

    expect(screen.getByText(/проверять нечего/i)).toBeInTheDocument();
  });

  it('инциденты не спрашивает, пока статус не открыл секцию', () => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(query(null));

    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />);

    expect(vi.mocked(hooks.useQueryIncidents)).toHaveBeenCalledWith('p1', { enabled: false });
  });

  it('разводит падения и сроки по двум блокам', () => {
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />);

    expect(screen.getByRole('heading', { name: 'Не отвечает' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Требует внимания' })).toBeInTheDocument();
  });

  it('предупреждения реестров показывает отдельным блоком', () => {
    // Отвечать на них проекту нечем: межпроектную машину и корневой
    // домен правит один суперадмин.
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);

    expect(screen.getByRole('heading', { name: 'Реестры' })).toBeInTheDocument();
    expect(screen.getByText('hetzner-fsn-1')).toBeInTheDocument();
  });

  it('пустой блок реестров не рисуется', () => {
    vi.mocked(hooks.useQueryProjectStatus).mockReturnValue(query({ ...STATUS, registryWarnings: [] }));

    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);

    expect(screen.queryByRole('heading', { name: 'Реестры' })).not.toBeInTheDocument();
  });

  it('кнопку проверки показывает только суперадмину', () => {
    const { rerender } = render(
      <InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />,
    );

    expect(screen.queryByRole('button', { name: 'Проверить сейчас' })).not.toBeInTheDocument();

    rerender(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);

    expect(screen.getByRole('button', { name: 'Проверить сейчас' })).toBeInTheDocument();
  });

  it('запуск проверок объясняет, что результат придёт не сразу', () => {
    // Ручка отвечает `202` и уходит проверять в фоне: без этой строки
    // кнопка мигала бы и возвращалась, а на экране ничего не менялось.
    vi.mocked(hooks.useMutationRunChecks).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      error: null,
    } as never);

    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);

    expect(screen.queryByText(/в течение/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проверить сейчас' })).toBeEnabled();
  });

  it('до запуска ничего про проверки не обещает', () => {
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);

    expect(screen.queryByText(/проверки запущены/i)).not.toBeInTheDocument();
  });

  it('отказ запуска показывает словами сервера', () => {
    // Прогон уже идёт — сервер отвечает `409`, и молчание выглядело бы
    // как «кнопка не работает».
    vi.mocked(hooks.useMutationRunChecks).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      error: new ApiError(409, 'Проверки уже идут'),
    } as never);

    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin />);

    expect(screen.getByRole('alert')).toHaveTextContent('Проверки уже идут');
  });

  it('по клику на адрес открывает разбор', async () => {
    render(<InfrastructureStatusPanel projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'stage.example.com' }));

    expect(screen.getByRole('dialog', { name: 'Разбор адреса' })).toBeInTheDocument();
    expect(vi.mocked(hooks.useQueryAddressIncidents)).toHaveBeenCalledWith('p1', DOMAIN_ID);
  });
});
