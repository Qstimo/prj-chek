import {
  HealthState,
  ProjectLifecycle,
  StatusIndicator,
  StatusWarningKind,
  type DomainStatus,
  type EnvironmentStatus,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import {
  domainRenewalWarningsOf,
  indicatorOf,
  serverIndicatorOf,
  serverWarningsOf,
  warningsOf,
} from './indicator';

const NOW = new Date('2026-08-28T12:00:00Z');

function env(overrides: Partial<EnvironmentStatus> = {}): EnvironmentStatus {
  return {
    environmentId: '11111111-1111-1111-1111-111111111111',
    name: 'Прод',
    health: HealthState.Up,
    checkedAt: NOW.toISOString(),
    ...overrides,
  };
}

function domain(overrides: Partial<DomainStatus> = {}): DomainStatus {
  return {
    domainId: '22222222-2222-2222-2222-222222222222',
    environmentId: '11111111-1111-1111-1111-111111111111',
    name: 'example.com',
    health: HealthState.Up,
    latencyMs: 40,
    healthError: null,
    resolvedIp: null,
    resolveError: null,
    tlsValidTo: '2027-01-01T00:00:00.000Z',
    tlsError: null,
    registryExpiresAt: '2027-06-01T00:00:00.000Z',
    registryError: null,
    checkedAt: NOW.toISOString(),
    ...overrides,
  };
}

/** Мёртвый адрес: именно он, а не окружение, требует починки. */
function down(name: string, healthError: string | null): DomainStatus {
  return domain({ name, health: HealthState.Down, latencyMs: null, healthError });
}

describe('warningsOf', () => {
  it('спокойное состояние не даёт предупреждений', () => {
    expect(warningsOf([domain()], NOW)).toEqual([]);
  });

  it('TLS за 13 дней — предупреждение, за 15 — нет', () => {
    const soon = domain({ tlsValidTo: '2026-09-10T00:00:00.000Z' }); // через 13 дней
    const later = domain({ tlsValidTo: '2026-09-12T13:00:00.000Z' }); // через 15 дней

    expect(warningsOf([soon], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.TlsExpiring,
    ]);
    expect(warningsOf([later], NOW)).toEqual([]);
  });

  it('истёкший TLS — предупреждение', () => {
    const expired = domain({ tlsValidTo: '2026-08-01T00:00:00.000Z' });

    expect(warningsOf([expired], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.TlsExpiring,
    ]);
  });

  it('домен за 29 дней — предупреждение', () => {
    const soon = domain({ registryExpiresAt: '2026-09-26T00:00:00.000Z' });

    expect(warningsOf([soon], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.DomainExpiring,
    ]);
  });

  it('ошибка проверки TLS — предупреждение', () => {
    const broken = domain({ tlsValidTo: null, tlsError: 'нет соединения' });

    expect(warningsOf([broken], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.TlsError,
    ]);
  });

  it('предупреждение о падении называет адрес, а не окружение', () => {
    // «Стейдж не отвечает» не говорит, что чинить, а адрес говорит.
    const warnings = warningsOf([down('stage.example.com', 'HTTP 502')], NOW);

    expect(warnings[0]).toMatchObject({
      kind: StatusWarningKind.HealthDown,
      subject: 'stage.example.com',
      detail: 'HTTP 502',
    });
  });

  it('без причины падение всё равно названо', () => {
    expect(warningsOf([down('stage.example.com', null)], NOW)[0]?.detail).toBe('не отвечает');
  });
});

describe('indicatorOf', () => {
  it('приостановленный проект — «приостановлен», что бы ни горело', () => {
    expect(indicatorOf(ProjectLifecycle.Paused, [down('stage.example.com', null)], NOW)).toBe(
      StatusIndicator.Paused,
    );
  });

  it('мёртвый адрес делает индикатор аварийным', () => {
    expect(indicatorOf(ProjectLifecycle.Active, [down('stage.example.com', null)], NOW)).toBe(
      StatusIndicator.Down,
    );
  });

  it('предупреждение бьёт «в порядке»', () => {
    const expiring = domain({ registryExpiresAt: '2026-09-01T00:00:00.000Z' });

    expect(indicatorOf(ProjectLifecycle.Active, [expiring], NOW)).toBe(StatusIndicator.Warning);
  });

  it('всё проверено и живо — «в порядке»', () => {
    expect(indicatorOf(ProjectLifecycle.Active, [domain()], NOW)).toBe(StatusIndicator.Ok);
  });

  it('без единой проверки индикатор неизвестен', () => {
    const unchecked = domain({ health: null, latencyMs: null, checkedAt: null });

    expect(indicatorOf(ProjectLifecycle.Active, [unchecked], NOW)).toBe(StatusIndicator.Unknown);
    expect(indicatorOf(ProjectLifecycle.Active, [], NOW)).toBe(StatusIndicator.Unknown);
  });

  it('сторонние предупреждения тоже красят индикатор', () => {
    // Сроки оплаты серверов считаются от машин, а не от адресов.
    expect(
      indicatorOf(ProjectLifecycle.Active, [domain()], NOW, [
        { kind: StatusWarningKind.ServerExpiring, subject: 'srv', detail: 'оплачен до 2026-09-01' },
      ]),
    ).toBe(StatusIndicator.Warning);
  });
});

describe('предупреждения о сроке оплаты сервера', () => {
  it('молчит, когда срок не задан', () => {
    expect(serverWarningsOf('hetzner-fsn-1', null, NOW)).toEqual([]);
  });

  it('молчит, когда до срока больше двух недель', () => {
    expect(serverWarningsOf('hetzner-fsn-1', '2026-09-12', NOW)).toEqual([]);
  });

  it('предупреждает ровно за две недели', () => {
    // Граница включительная: за 14 дней предупредить ещё не поздно.
    const [warning] = serverWarningsOf('hetzner-fsn-1', '2026-09-11', NOW);

    expect(warning).toEqual({
      kind: StatusWarningKind.ServerExpiring,
      subject: 'hetzner-fsn-1',
      detail: 'оплачен до 2026-09-11',
    });
  });

  it('предупреждает в день окончания оплаты', () => {
    const [warning] = serverWarningsOf('hetzner-fsn-1', '2026-08-28', NOW);

    expect(warning?.detail).toBe('оплачен до 2026-08-28');
  });

  it('сообщает о просрочке и её длительности', () => {
    const [warning] = serverWarningsOf('hetzner-fsn-1', '2026-08-27', NOW);

    expect(warning?.detail).toBe('оплата истекла 1 день назад');
    expect(serverWarningsOf('srv', '2026-08-23', NOW)[0]?.detail).toBe(
      'оплата истекла 5 дней назад',
    );
  });
});

describe('индикатор сервера', () => {
  it('без окружений и без срока — неизвестно', () => {
    expect(serverIndicatorOf([], null, NOW)).toBe(StatusIndicator.Unknown);
  });

  it('оплаченный сервер без единой проверки — неизвестно, а не в порядке', () => {
    // Зелёный индикатор означает «работает», а не «оплачено»: машина,
    // за которой никто не наблюдает, не может быть «в порядке».
    expect(serverIndicatorOf([], '2027-01-01', NOW)).toBe(StatusIndicator.Unknown);
    expect(serverIndicatorOf([env({ health: null })], '2027-01-01', NOW)).toBe(
      StatusIndicator.Unknown,
    );
  });

  it('близкий срок предупреждает даже без проверок', () => {
    expect(serverIndicatorOf([], '2026-09-05', NOW)).toBe(StatusIndicator.Warning);
  });

  it('живое окружение и далёкий срок — в порядке', () => {
    expect(serverIndicatorOf([env()], '2026-12-01', NOW)).toBe(StatusIndicator.Ok);
  });

  it('все проверяемые окружения лежат — авария', () => {
    expect(
      serverIndicatorOf([env({ health: HealthState.Down }), env({ health: null })], null, NOW),
    ).toBe(StatusIndicator.Down);
  });

  it('лежит часть окружений — предупреждение', () => {
    expect(serverIndicatorOf([env(), env({ health: HealthState.Down })], null, NOW)).toBe(
      StatusIndicator.Warning,
    );
  });

  it('близкий срок оплаты при живых окружениях — предупреждение', () => {
    expect(serverIndicatorOf([env()], '2026-09-05', NOW)).toBe(StatusIndicator.Warning);
  });

  it('просроченная оплата — предупреждение, а не авария', () => {
    // Авария означает наблюдаемую недоступность, а неоплаченная машина
    // может работать ещё неделю.
    expect(serverIndicatorOf([env()], '2026-08-01', NOW)).toBe(StatusIndicator.Warning);
  });
});

describe('предупреждения о продлении домена', () => {
  it('молчит, когда срок не задан', () => {
    expect(domainRenewalWarningsOf('example.com', null, NOW)).toEqual([]);
  });

  it('молчит, когда до срока больше месяца', () => {
    expect(domainRenewalWarningsOf('example.com', '2026-09-28', NOW)).toEqual([]);
  });

  it('предупреждает ровно за месяц', () => {
    // Месяц, а не две недели как у сервера: освободившийся домен могут
    // перехватить в тот же день.
    const [warning] = domainRenewalWarningsOf('example.com', '2026-09-27', NOW);

    expect(warning).toEqual({
      kind: StatusWarningKind.DomainRenewalExpiring,
      subject: 'example.com',
      detail: 'оплачен до 2026-09-27',
    });
  });

  it('сообщает о просрочке со склонением дней', () => {
    expect(domainRenewalWarningsOf('example.com', '2026-08-27', NOW)[0]?.detail).toBe(
      'оплата истекла 1 день назад',
    );
    expect(domainRenewalWarningsOf('example.com', '2026-08-25', NOW)[0]?.detail).toBe(
      'оплата истекла 3 дня назад',
    );
  });
});
