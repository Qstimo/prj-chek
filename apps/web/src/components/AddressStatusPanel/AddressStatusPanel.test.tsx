import {
  HealthState,
  StatusCheckCode,
  StatusWarningKind,
  type AddressIncidentHistory,
  type DomainStatus,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { AddressStatusPanel } from './AddressStatusPanel';

vi.mock('@/api/hooks');

const DOMAIN_ID = '22222222-2222-2222-2222-222222222222';

const ADDRESS: DomainStatus = {
  domainId: DOMAIN_ID,
  environmentId: '11111111-1111-1111-1111-111111111111',
  name: 'stage.example.com',
  health: HealthState.Down,
  latencyMs: null,
  healthError: 'порт закрыт (ECONNREFUSED)',
  healthCode: StatusCheckCode.ConnectionRefused,
  redirectTo: null,
  resolvedIp: '203.0.113.10',
  resolvedIps: ['203.0.113.10', '203.0.113.11'],
  resolveError: null,
  tlsValidTo: '2027-01-01T00:00:00.000Z',
  tlsTrusted: true,
  tlsCode: null,
  tlsError: null,
  registryExpiresAt: '2027-06-01T00:00:00.000Z',
  registryError: null,
  checkedAt: '2026-09-17T10:00:00.000Z',
};

const HISTORY: AddressIncidentHistory = {
  domainId: DOMAIN_ID,
  name: ADDRESS.name,
  window: { days: 30, from: '2026-08-18T10:00:00.000Z', to: '2026-09-17T10:00:00.000Z' },
  summary: { falls: 2, downSeconds: 2 * 3600 + 15 * 60, uptime: 0.996875 },
  open: null,
  incidents: [
    {
      id: '00000000-0000-0000-0000-00000000000b',
      domainId: DOMAIN_ID,
      startedAt: '2026-09-16T10:00:00.000Z',
      resolvedAt: '2026-09-16T10:40:00.000Z',
      cause: 'HTTP 500',
    },
  ],
  offset: 0,
  limit: 20,
  nextOffset: null,
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

beforeEach(() => {
  vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue(query(HISTORY));
});

describe('панель разбора адреса', () => {
  it('показывает сохранённые IP вместе с текущим отказом DNS', () => {
    render(<AddressStatusPanel projectId="p1" address={{ ...ADDRESS, resolveError: 'ENOTFOUND' }} warnings={[]} onClose={vi.fn()} />);
    expect(screen.getByText(/203\.0\.113\.10.*203\.0\.113\.11/)).toHaveTextContent(/последние известные/i);
    expect(screen.getByText(/ENOTFOUND/)).toBeInTheDocument();
  });

  it('загружает следующую страницу и сохраняет список при отказе догрузки', async () => {
    const fetchNextPage = vi.fn();
    vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue({ data: { ...HISTORY, nextOffset: 20 },
      hasNextPage: true, fetchNextPage, isPending: false, isError: false, isFetching: false,
    } as never);
    const { rerender } = render(<AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
    vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue({ data: { ...HISTORY, nextOffset: 20 },
      hasNextPage: true, fetchNextPage, isPending: false, isError: true, isFetching: false,
    } as never);
    rerender(<AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/историю падений/);
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Показать ещё' })).toBeEnabled();
  });

  it('закрытая панель диалога не рисует', () => {
    render(<AddressStatusPanel projectId="p1" address={null} warnings={[]} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('называет адрес и три проверки по отдельности', () => {
    render(
      <AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />,
    );

    const panel = screen.getByRole('dialog', { name: 'Разбор адреса' });

    expect(panel).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'stage.example.com' })).toBeInTheDocument();
    expect(screen.getByText('Доступность')).toBeInTheDocument();
    expect(screen.getByText('Сертификат')).toBeInTheDocument();
    expect(screen.getByText('Домен')).toBeInTheDocument();
    expect(screen.getByText(/не отвечает \(порт закрыт \(ECONNREFUSED\)\)/)).toBeInTheDocument();
  });

  it('показывает все адреса разрешения имени, а не только первый', () => {
    // Резолверы ротируют порядок: первая запись плясала от прогона к
    // прогону, и предупреждение о расхождении мигало вместе с ней.
    render(
      <AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />,
    );

    expect(screen.getByText('смотрит на 203.0.113.10, 203.0.113.11')).toBeInTheDocument();
  });

  it('показывает время последней проверки', () => {
    render(
      <AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />,
    );

    expect(screen.getByText('17.09.2026, 13:00')).toBeInTheDocument();
  });

  it('показывает долю времени и суммарный простой за окно', () => {
    render(
      <AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />,
    );

    expect(screen.getByText(/99,68%/)).toBeInTheDocument();
    expect(screen.getByText(/2 ч 15 мин/)).toBeInTheDocument();
    expect(screen.getByText(/падал 2 раза за 30 дней/)).toBeInTheDocument();
  });

  it('перечисляет падения с причиной и длительностью', () => {
    render(
      <AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />,
    );

    expect(screen.getByText(/40 минут/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });

  it('пустая история сказана словами', () => {
    vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue(
      query({ ...HISTORY, summary: { falls: 0, downSeconds: 0, uptime: 1 }, incidents: [] }),
    );

    render(
      <AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />,
    );

    expect(screen.getByText(/нет зарегистрированных падений за 30 дней/)).toBeInTheDocument();
    expect(screen.getByText(/аптайм не измерен/)).toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });

  it('отказ истории объясняется, а не гасится', () => {
    vi.mocked(hooks.useQueryAddressIncidents).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(
      <AddressStatusPanel projectId="p1" address={ADDRESS} warnings={[]} onClose={vi.fn()} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/историю падений/i);
  });

  it('берёт предупреждения своего адреса и не берёт чужие', () => {
    render(
      <AddressStatusPanel
        projectId="p1"
        address={ADDRESS}
        warnings={[
          {
            kind: StatusWarningKind.HealthDown,
            subject: 'stage.example.com',
            detail: 'порт закрыт (ECONNREFUSED)',
            code: StatusCheckCode.ConnectionRefused,
          },
          {
            kind: StatusWarningKind.TlsExpired,
            subject: 'other.example.com',
            detail: 'TLS истёк',
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Адрес не отвечает')).toBeInTheDocument();
    expect(screen.queryByText('Сертификат истёк')).not.toBeInTheDocument();
  });
});
