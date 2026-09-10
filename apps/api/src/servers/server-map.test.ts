import { EnvironmentKind, HealthState, ProjectLifecycle, StatusIndicator } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { buildServerMap, type ServerMapInput } from './server-map';

const NOW = new Date('2026-09-10T12:00:00Z');

const SERVER_A = '11111111-1111-1111-1111-111111111111';
const SERVER_B = '22222222-2222-2222-2222-222222222222';
const PROJECT = '33333333-3333-3333-3333-333333333333';

function input(overrides: Partial<ServerMapInput> = {}): ServerMapInput {
  return {
    servers: [{ id: SERVER_A, name: 'alpha', owner: null, paidUntil: null }],
    placements: [],
    ...overrides,
  };
}

describe('сборка карты размещения', () => {
  it('пустой реестр даёт пустую карту', () => {
    expect(buildServerMap({ servers: [], placements: [] }, NOW)).toEqual({
      servers: [],
      projects: [],
      edges: [],
    });
  });

  it('показывает сервер без окружений узлом без рёбер', () => {
    const map = buildServerMap(input(), NOW);

    expect(map.servers).toEqual([
      expect.objectContaining({ name: 'alpha', indicator: StatusIndicator.Unknown }),
    ]);
    expect(map.edges).toEqual([]);
    expect(map.projects).toEqual([]);
  });

  it('складывает окружения одного проекта на одной машине в одно ребро', () => {
    const map = buildServerMap(
      input({
        placements: [
          placement(SERVER_A, 'e1', 'Прод', EnvironmentKind.Production),
          placement(SERVER_A, 'e2', 'Стейдж', EnvironmentKind.Staging),
        ],
      }),
      NOW,
    );

    expect(map.edges).toHaveLength(1);
    expect(map.edges[0]?.environments.map((environment) => environment.name)).toEqual([
      'Прод',
      'Стейдж',
    ]);
    expect(map.projects).toHaveLength(1);
  });

  it('проект на двух машинах даёт два ребра и один узел проекта', () => {
    const map = buildServerMap(
      {
        servers: [
          { id: SERVER_A, name: 'alpha', owner: null, paidUntil: null },
          { id: SERVER_B, name: 'beta', owner: null, paidUntil: null },
        ],
        placements: [
          placement(SERVER_A, 'e1', 'Прод', EnvironmentKind.Production),
          placement(SERVER_B, 'e2', 'Стейдж', EnvironmentKind.Staging),
        ],
      },
      NOW,
    );

    expect(map.edges).toHaveLength(2);
    expect(map.projects).toHaveLength(1);
  });

  it('считает индикатор машины по здоровью её окружений', () => {
    const map = buildServerMap(
      input({
        placements: [
          placement(SERVER_A, 'e1', 'Прод', EnvironmentKind.Production, HealthState.Down),
          placement(SERVER_A, 'e2', 'Стейдж', EnvironmentKind.Staging, HealthState.Down),
        ],
      }),
      NOW,
    );

    expect(map.servers[0]?.indicator).toBe(StatusIndicator.Down);
  });

  it('приостановленный проект остаётся приостановленным на карте', () => {
    const map = buildServerMap(
      input({
        placements: [
          {
            ...placement(SERVER_A, 'e1', 'Прод', EnvironmentKind.Production, HealthState.Down),
            projectLifecycle: ProjectLifecycle.Paused,
          },
        ],
      }),
      NOW,
    );

    expect(map.projects[0]?.indicator).toBe(StatusIndicator.Paused);
  });
});

/** Размещение окружения проекта на машине. */
function placement(
  serverId: string,
  environmentId: string,
  environmentName: string,
  kind: EnvironmentKind,
  health: HealthState | null = null,
): ServerMapInput['placements'][number] {
  return {
    serverId,
    environmentId,
    environmentName,
    environmentKind: kind,
    projectId: PROJECT,
    projectName: 'Витрина',
    projectLifecycle: ProjectLifecycle.Active,
    health,
  };
}
