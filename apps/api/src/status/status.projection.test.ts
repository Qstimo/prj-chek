import { HealthState, type DomainStatus } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { environmentStatusesOf } from './status.projection';

const ENVIRONMENT_ID = '11111111-1111-4111-8111-111111111111';

describe('здоровье окружения по его адресам', () => {
  it('мёртвый адрес делает окружение аварийным', () => {
    // Чинить придётся именно его, и молчать об этом нельзя.
    const [environment] = environmentStatusesOf(
      [{ id: ENVIRONMENT_ID, name: 'Прод' }],
      [address(HealthState.Up), address(HealthState.Down)],
    );

    expect(environment?.health).toBe(HealthState.Down);
  });

  it('все живы — окружение живо', () => {
    const [environment] = environmentStatusesOf(
      [{ id: ENVIRONMENT_ID, name: 'Прод' }],
      [address(HealthState.Up), address(HealthState.Up)],
    );

    expect(environment?.health).toBe(HealthState.Up);
  });

  it('непроверенный адрес не делает окружение неизвестным', () => {
    // Один адрес проверен и жив, второй ещё нет: молчание второго не
    // отменяет того, что первый отвечает.
    const [environment] = environmentStatusesOf(
      [{ id: ENVIRONMENT_ID, name: 'Прод' }],
      [address(HealthState.Up), address(null)],
    );

    expect(environment?.health).toBe(HealthState.Up);
  });

  it('окружение без адресов — неизвестно', () => {
    // Проверять нечем — значит, нечего и утверждать.
    const [environment] = environmentStatusesOf([{ id: ENVIRONMENT_ID, name: 'Прод' }], []);

    expect(environment?.health).toBeNull();
    expect(environment?.checkedAt).toBeNull();
  });

  it('время проверки — последнее среди адресов', () => {
    const [environment] = environmentStatusesOf(
      [{ id: ENVIRONMENT_ID, name: 'Прод' }],
      [
        address(HealthState.Up, '2026-09-17T09:00:00.000Z'),
        address(HealthState.Up, '2026-09-17T11:00:00.000Z'),
      ],
    );

    expect(environment?.checkedAt).toBe('2026-09-17T11:00:00.000Z');
  });

  it('чужой адрес окружению не приписывается', () => {
    const other = { ...address(HealthState.Down), environmentId: '22222222-2222-4222-8222-222222222222' };

    const [environment] = environmentStatusesOf([{ id: ENVIRONMENT_ID, name: 'Прод' }], [other]);

    expect(environment?.health).toBeNull();
  });

  it('сохраняет имя и порядок окружений', () => {
    const statuses = environmentStatusesOf(
      [
        { id: ENVIRONMENT_ID, name: 'Прод' },
        { id: '22222222-2222-4222-8222-222222222222', name: 'Стейдж' },
      ],
      [],
    );

    expect(statuses.map((status) => status.name)).toEqual(['Прод', 'Стейдж']);
    expect(statuses[0]?.environmentId).toBe(ENVIRONMENT_ID);
  });
});

/** Статус адреса: в проекции важны только окружение, здоровье и время. */
function address(health: HealthState | null, checkedAt: string | null = null): DomainStatus {
  return {
    domainId: '33333333-3333-4333-8333-333333333333',
    environmentId: ENVIRONMENT_ID,
    name: 'stage.example.com',
    health,
    latencyMs: null,
    healthError: null,
    resolvedIp: null,
    resolveError: null,
    tlsValidTo: null,
    tlsError: null,
    registryExpiresAt: null,
    registryError: null,
    checkedAt,
  };
}
