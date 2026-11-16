import {
  HealthState,
  StatusIndicator,
  type AddressIncidents,
  type DomainStatus,
  type ProjectStatus,
} from '@cairn/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StatusOverview } from './StatusOverview';

const ENVIRONMENT_ID = '11111111-1111-1111-1111-111111111111';
const DOMAIN_ID = '22222222-2222-2222-2222-222222222222';

function address(overrides: Partial<DomainStatus> = {}): DomainStatus {
  return {
    domainId: DOMAIN_ID,
    environmentId: ENVIRONMENT_ID,
    name: 'stage.example.com',
    health: HealthState.Up,
    latencyMs: 42,
    healthError: null,
    healthCode: null,
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
    ...overrides,
  };
}

const STATUS: ProjectStatus = {
  indicator: StatusIndicator.Ok,
  environments: [
    {
      environmentId: ENVIRONMENT_ID,
      name: 'Прод',
      health: HealthState.Up,
      checkedAt: '2026-09-17T10:00:00.000Z',
    },
  ],
  domains: [address()],
  warnings: [],
  registryWarnings: [],
};

const FALL: AddressIncidents = {
  domainId: DOMAIN_ID,
  name: 'stage.example.com',
  open: {
    id: '00000000-0000-0000-0000-00000000000a',
    domainId: DOMAIN_ID,
    startedAt: '2026-09-17T09:00:00.000Z',
    resolvedAt: null,
    cause: 'HTTP 500',
  },
  past: [],
  fallsInWindow: 1,
  windowDays: 30,
};

describe('сводка проверок', () => {
  it('показывает время последней проверки по проекту', () => {
    render(<StatusOverview status={STATUS} />);

    expect(screen.getByText(/Последняя проверка: 17\.09\.2026, 13:00/)).toBeInTheDocument();
  });

  it('у непроверенного проекта говорит об этом прямо', () => {
    render(<StatusOverview status={{ ...STATUS, domains: [address({ checkedAt: null })] }} />);

    expect(screen.getByText(/проверок ещё не было/i)).toBeInTheDocument();
  });

  it('ставит таблицу проверок', () => {
    render(<StatusOverview status={STATUS} />);

    expect(screen.getByRole('table', { name: 'Проверки адресов' })).toBeInTheDocument();
  });

  it('ведёт лентой падений под таблицей', () => {
    render(<StatusOverview status={STATUS} incidents={[FALL]} />);

    const feed = screen.getByRole('list', { name: 'Падения адресов' });

    expect(within(feed).getByText(/не отвечает с/)).toBeInTheDocument();
  });

  it('адрес без падений в ленту не попадает', () => {
    render(
      <StatusOverview
        status={STATUS}
        incidents={[{ ...FALL, open: null, past: [], fallsInWindow: 0 }]}
      />,
    );

    expect(screen.queryByRole('list', { name: 'Падения адресов' })).not.toBeInTheDocument();
    expect(screen.getByText(/падений за 30 дней не было/i)).toBeInTheDocument();
  });

  it('по клику на адрес в ленте открывает его разбор', async () => {
    const onSelect = vi.fn();
    render(<StatusOverview status={STATUS} incidents={[FALL]} onSelect={onSelect} />);

    const feed = screen.getByRole('list', { name: 'Падения адресов' });
    await userEvent.click(within(feed).getByRole('button', { name: 'stage.example.com' }));

    expect(onSelect).toHaveBeenCalledWith(DOMAIN_ID);
  });
});
