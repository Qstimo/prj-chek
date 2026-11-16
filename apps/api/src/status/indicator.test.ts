import {
  HealthState,
  ProjectLifecycle,
  StatusCheckCode,
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
    healthCode: null,
    redirectTo: null,
    resolvedIp: null,
    resolvedIps: [],
    resolveError: null,
    tlsValidTo: '2027-01-01T00:00:00.000Z',
    tlsTrusted: true,
    tlsCode: null,
    tlsError: null,
    registryExpiresAt: '2027-06-01T00:00:00.000Z',
    registryError: null,
    checkedAt: NOW.toISOString(),
    ...overrides,
  };
}

/** Мёртвый адрес: именно он, а не окружение, требует починки. */
function down(
  name: string,
  healthError: string | null,
  healthCode: StatusCheckCode | null = null,
): DomainStatus {
  return domain({ name, health: HealthState.Down, latencyMs: null, healthError, healthCode });
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

  it('предупреждение о TLS несёт срок, порог и день', () => {
    // Расшифровке на вебе нужно число, а не склеенная фраза.
    const soon = domain({ tlsValidTo: '2026-09-10T00:00:00.000Z' });

    expect(warningsOf([soon], NOW)[0]).toMatchObject({
      kind: StatusWarningKind.TlsExpiring,
      days: 13,
      threshold: 14,
      date: '2026-09-10',
    });
  });

  it('истёкший TLS — свой вид, а не «истекает»', () => {
    // Пока срок считался одним условием «меньше порога», истёкший был
    // неотличим от истекающего, хотя первый уже ломает доступ.
    const expired = domain({ tlsValidTo: '2026-08-01T00:00:00.000Z' });

    expect(warningsOf([expired], NOW)[0]).toMatchObject({
      kind: StatusWarningKind.TlsExpired,
      days: -27,
      date: '2026-08-01',
    });
  });

  it('недоверенный сертификат — свой вид, и срок ему не оправдание', () => {
    // Отсюда росло «не отвечает» рядом с зелёным «TLS до 2027-03-01»:
    // fetch отвергал сертификат, которому проверка TLS верила.
    const untrusted = domain({
      tlsValidTo: '2027-03-01T00:00:00.000Z',
      tlsTrusted: false,
      tlsCode: StatusCheckCode.CertificateUntrusted,
      tlsError: 'сертификат не вызывает доверия (DEPTH_ZERO_SELF_SIGNED_CERT)',
    });

    expect(warningsOf([untrusted], NOW)[0]).toMatchObject({
      kind: StatusWarningKind.TlsInvalid,
      code: StatusCheckCode.CertificateUntrusted,
    });
  });

  it('сертификат, отвергнутый как истёкший, даёт «истёк», а не «не доверяем»', () => {
    const expired = domain({
      tlsValidTo: '2015-04-12T23:59:59.000Z',
      tlsTrusted: false,
      tlsCode: StatusCheckCode.CertificateExpired,
      tlsError: 'сертификат истёк (CERT_HAS_EXPIRED)',
    });

    expect(warningsOf([expired], NOW).map((warning) => warning.kind)).toEqual([
      StatusWarningKind.TlsExpired,
    ]);
  });

  it('недоверенный сертификат не даёт заодно «истекает»', () => {
    // Два предупреждения об одном сертификате человек читает как два
    // разных недуга.
    const untrusted = domain({
      tlsValidTo: '2026-09-10T00:00:00.000Z',
      tlsTrusted: false,
      tlsCode: StatusCheckCode.CertificateNameMismatch,
      tlsError: 'сертификат выписан на другое имя',
    });

    expect(warningsOf([untrusted], NOW)).toHaveLength(1);
  });

  it('домен за 29 дней — предупреждение со сроком и порогом', () => {
    const soon = domain({ registryExpiresAt: '2026-09-26T00:00:00.000Z' });

    expect(warningsOf([soon], NOW)[0]).toMatchObject({
      kind: StatusWarningKind.DomainExpiring,
      days: 29,
      threshold: 30,
      date: '2026-09-26',
    });
  });

  it('ошибка проверки TLS — предупреждение с кодом', () => {
    // Рукопожатия не было: о сертификате не известно ничего, и это не то
    // же, что «сертификату не доверяем».
    const broken = domain({
      tlsValidTo: null,
      tlsTrusted: null,
      tlsCode: StatusCheckCode.ConnectionRefused,
      tlsError: 'соединение отвергнуто (ECONNREFUSED)',
    });

    expect(warningsOf([broken], NOW)[0]).toMatchObject({
      kind: StatusWarningKind.TlsError,
      code: StatusCheckCode.ConnectionRefused,
    });
  });

  it('предупреждение о падении называет адрес, а не окружение', () => {
    // «Стейдж не отвечает» не говорит, что чинить, а адрес говорит.
    const warnings = warningsOf(
      [down('stage.example.com', 'сервер ответил ошибкой (HTTP 502)', StatusCheckCode.ServerError)],
      NOW,
    );

    expect(warnings[0]).toMatchObject({
      kind: StatusWarningKind.HealthDown,
      subject: 'stage.example.com',
      detail: 'сервер ответил ошибкой (HTTP 502)',
      code: StatusCheckCode.ServerError,
    });
  });

  it('без причины падение всё равно названо', () => {
    expect(warningsOf([down('stage.example.com', null)], NOW)[0]?.detail).toBe('не отвечает');
  });

  it('404 на ручке проверки — предупреждение о настройке, а не падение', () => {
    // Адрес жив: предупреждение зовёт поправить путь, а не сервер.
    const misconfigured = domain({
      healthCode: StatusCheckCode.PathNotFound,
      healthError: 'ручка проверки не найдена (HTTP 404)',
    });

    expect(warningsOf([misconfigured], NOW)[0]).toMatchObject({
      kind: StatusWarningKind.HealthCheckMisconfigured,
      subject: 'example.com',
      code: StatusCheckCode.PathNotFound,
    });
  });

  it('закрытая авторизацией ручка не даёт предупреждения вовсе', () => {
    // Так и задумано хозяином стенда: это рабочее состояние.
    const closed = domain({ healthCode: StatusCheckCode.AuthRequired, healthError: null });

    expect(warningsOf([closed], NOW)).toEqual([]);
  });

  it('метод не разрешён и редирект — тоже не повод предупреждать', () => {
    expect(warningsOf([domain({ healthCode: StatusCheckCode.MethodNotAllowed })], NOW)).toEqual([]);
    expect(
      warningsOf(
        [domain({ healthCode: StatusCheckCode.Redirect, redirectTo: 'https://example.com/login' })],
        NOW,
      ),
    ).toEqual([]);
  });

  it('упавший адрес не получает заодно предупреждения о настройке', () => {
    const dead = down('stage.example.com', 'сервер ответил ошибкой', StatusCheckCode.ServerError);

    expect(warningsOf([dead], NOW)).toHaveLength(1);
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

  it('неверно настроенная ручка бьёт «в порядке», но не роняет', () => {
    const misconfigured = domain({
      healthCode: StatusCheckCode.PathNotFound,
      healthError: 'ручка проверки не найдена (HTTP 404)',
    });

    expect(indicatorOf(ProjectLifecycle.Active, [misconfigured], NOW)).toBe(
      StatusIndicator.Warning,
    );
  });

  it('адрес за авторизацией остаётся «в порядке»', () => {
    // Прежнее правило объявляло его упавшим и красило проект красным.
    const closed = domain({ healthCode: StatusCheckCode.AuthRequired });

    expect(indicatorOf(ProjectLifecycle.Active, [closed], NOW)).toBe(StatusIndicator.Ok);
  });

  it('всё проверено и живо — «в порядке»', () => {
    expect(indicatorOf(ProjectLifecycle.Active, [domain()], NOW)).toBe(StatusIndicator.Ok);
  });

  it('без единой проверки индикатор неизвестен', () => {
    const unchecked = domain({ health: null, latencyMs: null, checkedAt: null });

    expect(indicatorOf(ProjectLifecycle.Active, [unchecked], NOW)).toBe(StatusIndicator.Unknown);
    expect(indicatorOf(ProjectLifecycle.Active, [], NOW)).toBe(StatusIndicator.Unknown);
  });

  it('индикатор проекта считается только по его адресам', () => {
    // Сроки оплаты машин и корней правит суперадмин: проекту по такому
    // предупреждению делать нечего, и красить его индикатор оно не вправе.
    // Сами предупреждения не исчезают — они показываются отдельно.
    expect(indicatorOf(ProjectLifecycle.Active, [domain()], NOW)).toBe(StatusIndicator.Ok);
    expect(indicatorOf.length).toBe(3);
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

    expect(warning).toMatchObject({
      kind: StatusWarningKind.ServerExpiring,
      subject: 'hetzner-fsn-1',
      detail: 'оплачен до 2026-09-11',
      days: 14,
      threshold: 14,
      date: '2026-09-11',
    });
  });

  it('предупреждает в день окончания оплаты', () => {
    const [warning] = serverWarningsOf('hetzner-fsn-1', '2026-08-28', NOW);

    expect(warning?.detail).toBe('оплачен до 2026-08-28');
    expect(warning?.days).toBe(0);
  });

  it('сообщает о просрочке и её длительности', () => {
    const [warning] = serverWarningsOf('hetzner-fsn-1', '2026-08-27', NOW);

    expect(warning?.detail).toBe('оплата истекла 1 день назад');
    expect(warning?.days).toBe(-1);
    expect(serverWarningsOf('srv', '2026-08-23', NOW)[0]?.detail).toBe(
      'оплата истекла 5 дней назад',
    );
  });

  it('срок считается по UTC и не зависит от часа проверки', () => {
    // Одна договорённость на все сроки: полных суток от начала
    // сегодняшних UTC-суток до начала суток срока.
    const morning = new Date('2026-08-28T00:30:00Z');
    const night = new Date('2026-08-28T23:30:00Z');

    expect(serverWarningsOf('srv', '2026-09-11', morning)[0]?.days).toBe(14);
    expect(serverWarningsOf('srv', '2026-09-11', night)[0]?.days).toBe(14);
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

    expect(warning).toMatchObject({
      kind: StatusWarningKind.DomainRenewalExpiring,
      subject: 'example.com',
      detail: 'оплачен до 2026-09-27',
      days: 30,
      threshold: 30,
      date: '2026-09-27',
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
