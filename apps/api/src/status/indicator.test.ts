import {
  HealthState,
  ProjectLifecycle,
  StatusIndicator,
  StatusWarningKind,
  type DomainStatus,
  type EnvironmentStatus,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { indicatorOf, warningsOf } from './indicator';

const NOW = new Date('2026-08-28T12:00:00Z');

function env(overrides: Partial<EnvironmentStatus> = {}): EnvironmentStatus {
  return {
    environmentId: '11111111-1111-1111-1111-111111111111',
    name: 'Прод',
    health: HealthState.Up,
    latencyMs: 40,
    error: null,
    checkedAt: NOW.toISOString(),
    ...overrides,
  };
}

function domain(overrides: Partial<DomainStatus> = {}): DomainStatus {
  return {
    domainId: '22222222-2222-2222-2222-222222222222',
    name: 'example.com',
    tlsValidTo: '2027-01-01T00:00:00.000Z',
    tlsError: null,
    registryExpiresAt: '2027-06-01T00:00:00.000Z',
    registryError: null,
    checkedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('warningsOf', () => {
  it('спокойное состояние не даёт предупреждений', () => {
    expect(warningsOf([env()], [domain()], NOW)).toEqual([]);
  });

  it('TLS за 13 дней — предупреждение, за 15 — нет', () => {
    const soon = domain({ tlsValidTo: '2026-09-10T00:00:00.000Z' }); // через 13 дней
    const later = domain({ tlsValidTo: '2026-09-12T13:00:00.000Z' }); // через 15 дней

    expect(warningsOf([], [soon], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.TlsExpiring,
    ]);
    expect(warningsOf([], [later], NOW)).toEqual([]);
  });

  it('истёкший TLS — предупреждение', () => {
    const expired = domain({ tlsValidTo: '2026-08-01T00:00:00.000Z' });

    expect(warningsOf([], [expired], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.TlsExpiring,
    ]);
  });

  it('домен за 29 дней — предупреждение', () => {
    const soon = domain({ registryExpiresAt: '2026-09-26T00:00:00.000Z' });

    expect(warningsOf([], [soon], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.DomainExpiring,
    ]);
  });

  it('ошибка проверки TLS — предупреждение', () => {
    const broken = domain({ tlsValidTo: null, tlsError: 'нет соединения' });

    expect(warningsOf([], [broken], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.TlsError,
    ]);
  });

  it('упавшее окружение — предупреждение с причиной', () => {
    const down = env({ health: HealthState.Down, error: 'HTTP 500' });

    const warnings = warningsOf([down], [], NOW);

    expect(warnings[0]).toMatchObject({
      kind: StatusWarningKind.HealthDown,
      subject: 'Прод',
      detail: 'HTTP 500',
    });
  });
});

describe('indicatorOf', () => {
  it('приостановленный проект — «приостановлен», что бы ни горело', () => {
    const down = env({ health: HealthState.Down });

    expect(indicatorOf(ProjectLifecycle.Paused, [down], [], NOW)).toBe(StatusIndicator.Paused);
  });

  it('упавшее окружение бьёт предупреждение', () => {
    const down = env({ health: HealthState.Down, error: 'HTTP 500' });
    const expiring = domain({ tlsValidTo: '2026-09-01T00:00:00.000Z' });

    expect(indicatorOf(ProjectLifecycle.Active, [down], [expiring], NOW)).toBe(
      StatusIndicator.Down,
    );
  });

  it('предупреждение бьёт «в порядке»', () => {
    const expiring = domain({ registryExpiresAt: '2026-09-01T00:00:00.000Z' });

    expect(indicatorOf(ProjectLifecycle.Active, [env()], [expiring], NOW)).toBe(
      StatusIndicator.Warning,
    );
  });

  it('всё проверено и живо — «в порядке»', () => {
    expect(indicatorOf(ProjectLifecycle.Active, [env()], [domain()], NOW)).toBe(
      StatusIndicator.Ok,
    );
  });

  it('без единого результата — «неизвестно»', () => {
    const unchecked = env({ health: null, latencyMs: null, checkedAt: null });

    expect(indicatorOf(ProjectLifecycle.Active, [unchecked], [], NOW)).toBe(
      StatusIndicator.Unknown,
    );
    expect(indicatorOf(ProjectLifecycle.Active, [], [], NOW)).toBe(StatusIndicator.Unknown);
  });
});
