import { HealthState, type DomainStatus, type EnvironmentStatus } from '@cairn/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusByEnvironment } from './StatusByEnvironment';

const ENVIRONMENT_ID = '11111111-1111-1111-1111-111111111111';

const prod: EnvironmentStatus = {
  environmentId: ENVIRONMENT_ID,
  name: 'Прод',
  health: HealthState.Up,
  checkedAt: '2026-09-17T10:00:00.000Z',
};

function address(overrides: Partial<DomainStatus> = {}): DomainStatus {
  return {
    domainId: '22222222-2222-2222-2222-222222222222',
    environmentId: ENVIRONMENT_ID,
    name: 'stage.example.com',
    health: HealthState.Up,
    latencyMs: 42,
    healthError: null,
    resolvedIp: '203.0.113.10',
    resolveError: null,
    tlsValidTo: '2027-01-01T00:00:00.000Z',
    tlsError: null,
    registryExpiresAt: '2027-06-01T00:00:00.000Z',
    registryError: null,
    checkedAt: '2026-09-17T10:00:00.000Z',
    ...overrides,
  };
}

describe('StatusByEnvironment', () => {
  it('показывает адреса под их окружением', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    const prodItem = screen.getByRole('listitem', { name: 'Прод' });

    expect(within(prodItem).getByText(/stage\.example\.com/)).toBeInTheDocument();
  });

  it('у мёртвого адреса показывает причину', () => {
    // Именно это отвечает на вопрос «что чинить».
    const dead = address({ health: HealthState.Down, latencyMs: null, healthError: 'HTTP 502' });

    render(<StatusByEnvironment environments={[prod]} addresses={[dead]} />);

    expect(screen.getByText(/не отвечает \(HTTP 502\)/)).toBeInTheDocument();
  });

  it('у живого адреса показывает задержку, сертификат и срок', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    const line = screen.getByRole('listitem', { name: 'stage.example.com' });

    expect(within(line).getByText(/работает, 42 мс/)).toBeInTheDocument();
    expect(within(line).getByText(/TLS до 2027-01-01/)).toBeInTheDocument();
    expect(within(line).getByText(/регистрация до 2027-06-01/)).toBeInTheDocument();
  });

  it('непроверенный адрес говорит об этом, а не молчит', () => {
    const fresh = address({
      health: null,
      latencyMs: null,
      tlsValidTo: null,
      registryExpiresAt: null,
      checkedAt: null,
    });

    render(<StatusByEnvironment environments={[prod]} addresses={[fresh]} />);

    expect(screen.getByText('не проверялся')).toBeInTheDocument();
  });

  it('ошибку проверки показывает вместо срока', () => {
    const broken = address({ tlsValidTo: null, tlsError: 'нет соединения' });

    render(<StatusByEnvironment environments={[prod]} addresses={[broken]} />);

    expect(screen.getByText(/TLS: нет соединения/)).toBeInTheDocument();
  });

  it('показывает, на какой адрес смотрит имя', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    expect(screen.getByText('смотрит на 203.0.113.10')).toBeInTheDocument();
  });

  it('неразрешённое имя объясняет причину', () => {
    const broken = address({ resolvedIp: null, resolveError: 'queryA ENOTFOUND' });

    render(<StatusByEnvironment environments={[prod]} addresses={[broken]} />);

    expect(screen.getByText(/не разрешается: queryA ENOTFOUND/)).toBeInTheDocument();
  });

  it('не называет машину: её имя принадлежит уровню чтения', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    expect(screen.queryByText(/hetzner/i)).not.toBeInTheDocument();
  });

  it('окружение без адресов говорит, что проверять нечего', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[]} />);

    expect(screen.getByText(/нет адресов/i)).toBeInTheDocument();
  });

  it('чужой адрес под окружение не подставляется', () => {
    const other = address({ environmentId: '33333333-3333-3333-3333-333333333333' });

    render(<StatusByEnvironment environments={[prod]} addresses={[other]} />);

    expect(screen.queryByText(/stage\.example\.com/)).not.toBeInTheDocument();
  });
});
