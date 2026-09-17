import {
  type DomainStatus,
  type EnvironmentKind,
  type EnvironmentStatus,
  type HealthState,
  type ProjectLifecycle,
  type ServerMap,
} from '@cairn/shared';

import { indicatorOf, serverIndicatorOf, serverWarningsOf } from '../status/indicator';

/** Отметка проверки: индикатору она нужна, чтобы отличить «в порядке» от «неизвестно». */
const CHECKED_AT = new Date(0).toISOString();

/** Машина реестра в объёме, нужном карте. */
export interface ServerMapServer {
  id: string;
  name: string;
  owner: string | null;
  paidUntil: string | null;
}

/** Окружение проекта, стоящее на машине. */
export interface ServerMapPlacement {
  serverId: string;
  environmentId: string;
  environmentName: string;
  environmentKind: EnvironmentKind;
  projectId: string;
  projectName: string;
  projectLifecycle: ProjectLifecycle;
  health: HealthState | null;
}

/** Плоские строки, из которых собирается карта. */
export interface ServerMapInput {
  servers: ServerMapServer[];
  placements: ServerMapPlacement[];
}

/**
 * Собирает карту размещения из плоских строк.
 *
 * Отдельная чистая функция, а не метод репозитория: группировка рёбер и
 * подсчёт индикаторов — самая содержательная часть карты, и проверять её
 * поднятой базой значило бы платить контейнером за арифметику.
 *
 * Окружения без машины в карту не попадают: карта отвечает на вопрос
 * «что упадёт вместе с этой машиной», а не «какие вообще есть проекты».
 */
export function buildServerMap(input: ServerMapInput, now: Date): ServerMap {
  const byServer = groupBy(input.placements, (placement) => placement.serverId);
  const byProject = groupBy(input.placements, (placement) => placement.projectId);
  const byEdge = groupBy(
    input.placements,
    (placement) => `${placement.serverId} ${placement.projectId}`,
  );

  return {
    servers: input.servers.map((server) => ({
      id: server.id,
      name: server.name,
      owner: server.owner,
      indicator: serverIndicatorOf(
        environmentStatusesOf(byServer.get(server.id) ?? []),
        server.paidUntil,
        now,
      ),
      paidUntil: server.paidUntil,
      warnings: serverWarningsOf(server.name, server.paidUntil, now),
    })),
    projects: [...byProject.values()].map((placements) => {
      const first = placements[0]!;

      return {
        id: first.projectId,
        name: first.projectName,
        lifecycle: first.projectLifecycle,
        indicator: indicatorOf(first.projectLifecycle, addressStatusesOf(placements), now),
      };
    }),
    edges: [...byEdge.values()].map((placements) => {
      const first = placements[0]!;

      return {
        serverId: first.serverId,
        projectId: first.projectId,
        environments: placements.map((placement) => ({
          id: placement.environmentId,
          name: placement.environmentName,
          kind: placement.environmentKind,
        })),
      };
    }),
  };
}

/** Приводит размещения к статусам окружений, понятным вычислению индикаторов. */
function environmentStatusesOf(placements: ServerMapPlacement[]): EnvironmentStatus[] {
  return placements.map((placement) => ({
    environmentId: placement.environmentId,
    name: placement.environmentName,
    health: placement.health,
    checkedAt: placement.health ? CHECKED_AT : null,
  }));
}

/**
 * Те же размещения глазами индикатора проекта.
 *
 * Индикатор считается по адресам, а карта знает здоровье окружения целиком —
 * поэтому каждое окружение представляется здесь одним адресом. Считать
 * индикатор своим правилом значило бы завести ему второй экземпляр.
 */
function addressStatusesOf(placements: ServerMapPlacement[]): DomainStatus[] {
  return placements.map((placement) => ({
    domainId: placement.environmentId,
    environmentId: placement.environmentId,
    name: placement.environmentName,
    health: placement.health,
    latencyMs: null,
    healthError: null,
    tlsValidTo: null,
    tlsError: null,
    registryExpiresAt: null,
    registryError: null,
    checkedAt: placement.health ? CHECKED_AT : null,
  }));
}

/** Группирует строки по ключу, сохраняя порядок появления. */
function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = keyOf(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}
