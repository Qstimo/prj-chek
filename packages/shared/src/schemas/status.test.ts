import { describe, expect, it } from 'vitest';

import { HealthState, StatusIndicator } from '../enums';
import {
  domainStatusSchema,
  environmentStatusSchema,
  projectStatusSchema,
  statusSummaryRowSchema,
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
          resolvedIp: null,
          resolveError: null,
          tlsValidTo: null,
          tlsError: 'нет соединения',
          registryExpiresAt: '2026-09-20T00:00:00.000Z',
          registryError: null,
          checkedAt: '2026-08-28T10:00:00.000Z',
        },
      ],
      warnings: [{ kind: 'tls_error', subject: 'example.com', detail: 'нет соединения' }],
    });

    expect(parsed.indicator).toBe(StatusIndicator.Warning);
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
    resolvedIp: null,
    resolveError: null,
    tlsValidTo: null,
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
