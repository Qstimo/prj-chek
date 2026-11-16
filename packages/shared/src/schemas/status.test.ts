import { describe, expect, it } from 'vitest';

import { HealthState, StatusCheckCode, StatusIndicator, StatusWarningKind } from '../enums';
import {
  domainStatusSchema,
  environmentStatusSchema,
  projectStatusSchema,
  statusSummaryRowSchema,
  statusWarningSchema,
} from './status';

const ENVIRONMENT_ID = '11111111-1111-1111-1111-111111111111';
const DOMAIN_ID = '22222222-2222-2222-2222-222222222222';

describe('схема статуса проекта', () => {
  it('принимает собранный агрегат', () => {
    const parsed = projectStatusSchema.parse({
      indicator: StatusIndicator.Warning,
      environments: [
        {
          environmentId: ENVIRONMENT_ID,
          name: 'Прод',
          health: 'up',
          checkedAt: '2026-08-28T10:00:00.000Z',
        },
      ],
      domains: [
        {
          domainId: DOMAIN_ID,
          environmentId: ENVIRONMENT_ID,
          name: 'example.com',
          health: null,
          latencyMs: null,
          healthError: null,
          healthCode: null,
          redirectTo: null,
          resolvedIp: null,
          resolvedIps: [],
          resolveError: null,
          tlsValidTo: null,
          tlsTrusted: null,
          tlsCode: StatusCheckCode.ConnectionRefused,
          tlsError: 'нет соединения',
          registryExpiresAt: '2026-09-20T00:00:00.000Z',
          registryError: null,
          checkedAt: '2026-08-28T10:00:00.000Z',
        },
      ],
      warnings: [{ kind: 'tls_error', subject: 'example.com', detail: 'нет соединения' }],
      registryWarnings: [
        { kind: 'server_expiring', subject: 'hetzner-fsn-1', detail: 'оплачен до 2026-09-01' },
      ],
    });

    expect(parsed.indicator).toBe(StatusIndicator.Warning);
    expect(parsed.registryWarnings[0]?.kind).toBe(StatusWarningKind.ServerExpiring);
  });

  it('требует список предупреждений реестров отдельно от остальных', () => {
    // Отдельным полем, потому что отвечать на них проекту нечем:
    // межпроектную машину и корневой домен правит один суперадмин, и
    // не-суперадмину список приходит пустым. Необязательным его делать
    // нельзя — пропущенное поле выглядело бы как «реестры молчат».
    expect(() =>
      projectStatusSchema.parse({
        indicator: StatusIndicator.Unknown,
        environments: [],
        domains: [],
        warnings: [],
      }),
    ).toThrow();
  });

  it('непроверенное окружение выражается null-полями', () => {
    const parsed = projectStatusSchema.parse({
      indicator: StatusIndicator.Unknown,
      environments: [
        {
          environmentId: ENVIRONMENT_ID,
          name: 'Прод',
          health: null,
          checkedAt: null,
        },
      ],
      domains: [],
      warnings: [],
      registryWarnings: [],
    });

    expect(parsed.environments[0]!.health).toBeNull();
  });

  it('отвергает индикатор вне перечисления', () => {
    expect(() =>
      statusSummaryRowSchema.parse({
        projectId: '11111111-1111-1111-1111-111111111111',
        indicator: 'blinking',
        warnings: [],
      }),
    ).toThrow();
  });
});

describe('схема статуса адреса', () => {
  const ADDRESS = {
    domainId: DOMAIN_ID,
    environmentId: ENVIRONMENT_ID,
    name: 'stage.example.com',
    health: HealthState.Down,
    latencyMs: 120,
    healthError: 'HTTP 502',
    healthCode: StatusCheckCode.ServerError,
    redirectTo: null,
    resolvedIp: null,
    resolvedIps: [],
    resolveError: null,
    tlsValidTo: null,
    tlsTrusted: null,
    tlsCode: null,
    tlsError: null,
    registryExpiresAt: null,
    registryError: null,
    checkedAt: '2026-09-17T10:00:00.000Z',
  };

  it('держит все три проверки в одной строке', () => {
    // Пока здоровье и сроки лежали порознь, они могли описывать разные
    // хосты: ключ у строки один — адрес.
    const parsed = domainStatusSchema.parse(ADDRESS);

    expect(parsed).toMatchObject({ health: HealthState.Down, healthError: 'HTTP 502' });
  });

  it('знает, чьё это окружение', () => {
    expect(domainStatusSchema.parse(ADDRESS).environmentId).toBe(ENVIRONMENT_ID);
  });

  it('помнит, во что имя разрешилось', () => {
    // Разрешение — такая же наблюдаемая правда об имени, как срок
    // сертификата: место ей в той же строке.
    const parsed = domainStatusSchema.parse({ ...ADDRESS, resolvedIp: '203.0.113.10' });

    expect(parsed.resolvedIp).toBe('203.0.113.10');
    expect(parsed.resolveError).toBeNull();
  });

  it('неразрешённое имя держит причину', () => {
    const parsed = domainStatusSchema.parse({
      ...ADDRESS,
      resolveError: 'queryA ENOTFOUND',
    });

    expect(parsed.resolvedIp).toBeNull();
    expect(parsed.resolveError).toBe('queryA ENOTFOUND');
  });

  it('держит все адреса записи, а не только первый', () => {
    // Резолверы ротируют порядок: один адрес из множества плясал бы от
    // прогона к прогону, и предупреждение о расхождении мигало бы вместе
    // с ним.
    const parsed = domainStatusSchema.parse({
      ...ADDRESS,
      resolvedIp: '203.0.113.10',
      resolvedIps: ['203.0.113.10', '203.0.113.11'],
    });

    expect(parsed.resolvedIps).toEqual(['203.0.113.10', '203.0.113.11']);
    expect(parsed.resolvedIp).toBe('203.0.113.10');
  });

  it('держит код наблюдения health рядом с фразой', () => {
    // Фраза — для человека, код — для расшифровки: «закрыто авторизацией»
    // и «сервер ответил ошибкой» требуют разных действий.
    const parsed = domainStatusSchema.parse({
      ...ADDRESS,
      health: HealthState.Up,
      healthError: null,
      healthCode: StatusCheckCode.AuthRequired,
    });

    expect(parsed.healthCode).toBe(StatusCheckCode.AuthRequired);
  });

  it('держит цель редиректа', () => {
    // 302 на чужое имя — рабочая настройка у одних и угнанная запись у
    // других: разобрать это можно, только увидев цель.
    const parsed = domainStatusSchema.parse({
      ...ADDRESS,
      healthCode: StatusCheckCode.Redirect,
      redirectTo: 'https://example.com/login',
    });

    expect(parsed.redirectTo).toBe('https://example.com/login');
  });

  it('держит доверие сертификату рядом с его сроком', () => {
    // Пока в строке лежал один срок, «не отвечает» уживалось с зелёным
    // «TLS до 2027-03-01»: fetch отвергал сертификат, которому проверка
    // TLS верила.
    const parsed = domainStatusSchema.parse({
      ...ADDRESS,
      tlsValidTo: '2027-03-01T00:00:00.000Z',
      tlsTrusted: false,
      tlsCode: StatusCheckCode.CertificateUntrusted,
    });

    expect(parsed.tlsTrusted).toBe(false);
    expect(parsed.tlsCode).toBe(StatusCheckCode.CertificateUntrusted);
  });

  it('отвергает код вне перечисления', () => {
    expect(() => domainStatusSchema.parse({ ...ADDRESS, healthCode: 'разладилось' })).toThrow();
  });

  it('непроверенный адрес выражается null-полями', () => {
    const parsed = domainStatusSchema.parse({
      ...ADDRESS,
      health: null,
      latencyMs: null,
      healthError: null,
      checkedAt: null,
    });

    expect(parsed.health).toBeNull();
  });
});

describe('схема предупреждения', () => {
  it('принимает предупреждение без структурных полей', () => {
    // У расхождения привязки нет ни срока, ни порога, ни кода: заставлять
    // такой вид писать четыре пустоты значит засорить всех производителей.
    const parsed = statusWarningSchema.parse({
      kind: StatusWarningKind.AddressesDisagree,
      subject: 'Прод',
      detail: 'адреса смотрят на разные машины',
    });

    expect('code' in parsed).toBe(false);
  });

  it('несёт код наблюдения для расшифровки', () => {
    const parsed = statusWarningSchema.parse({
      kind: StatusWarningKind.HealthDown,
      subject: 'example.com',
      detail: 'не отвечает: соединение отвергнуто (ECONNREFUSED)',
      code: StatusCheckCode.ConnectionRefused,
    });

    expect(parsed.code).toBe(StatusCheckCode.ConnectionRefused);
  });

  it('несёт срок, порог и день — расшифровке нужно число, а не фраза', () => {
    const parsed = statusWarningSchema.parse({
      kind: StatusWarningKind.TlsExpiring,
      subject: 'example.com',
      detail: 'TLS истекает 2026-09-10',
      days: 13,
      threshold: 14,
      date: '2026-09-10',
    });

    expect(parsed).toMatchObject({ days: 13, threshold: 14, date: '2026-09-10' });
  });

  it('просрочка выражается отрицательным сроком', () => {
    // Истёкший и истекающий — разные виды, но число у них одно и то же
    // поле: знак и есть разница.
    const parsed = statusWarningSchema.parse({
      kind: StatusWarningKind.TlsExpired,
      subject: 'example.com',
      detail: 'TLS истёк 2026-08-01',
      days: -27,
      date: '2026-08-01',
    });

    expect(parsed.days).toBe(-27);
  });

  it('отвергает день не в форме ГГГГ-ММ-ДД', () => {
    expect(() =>
      statusWarningSchema.parse({
        kind: StatusWarningKind.TlsExpiring,
        subject: 'example.com',
        detail: 'TLS истекает',
        date: '10.09.2026',
      }),
    ).toThrow();
  });
});

describe('схема статуса окружения', () => {
  it('держит вывод, а не измерение', () => {
    // Задержка и причина принадлежат адресу: у окружения их несколько.
    const parsed = environmentStatusSchema.parse({
      environmentId: ENVIRONMENT_ID,
      name: 'Прод',
      health: HealthState.Up,
      checkedAt: '2026-09-17T10:00:00.000Z',
    });

    expect(parsed.health).toBe(HealthState.Up);
    expect('latencyMs' in parsed).toBe(false);
  });
});
