'use client';

import type { ServerMap } from '@cairn/shared';
import Link from 'next/link';

/** Пропсы списка связей узла. */
interface IProps {
  map: ServerMap;
  selectedId: string;
  /** Выделена машина: перечисляем её проекты. Иначе — машины проекта. */
  isServer: boolean;
}

/** Что связано с выделенным узлом: проекты машины либо машины проекта. */
export function PlacementList({ map, selectedId, isServer }: IProps) {
  const edges = map.edges.filter((edge) =>
    isServer ? edge.serverId === selectedId : edge.projectId === selectedId,
  );

  if (edges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {isServer ? 'На сервере пока ничего нет.' : 'Проект не привязан к серверам.'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {edges.map((edge) => {
        const counterpart = isServer
          ? map.projects.find((project) => project.id === edge.projectId)
          : map.servers.find((server) => server.id === edge.serverId);

        return (
          <li key={`${edge.serverId}-${edge.projectId}`} className="text-sm">
            {isServer ? (
              <Link href={`/projects/${edge.projectId}`} className="hover:underline">
                {counterpart?.name}
              </Link>
            ) : (
              <Link href={`/servers/${edge.serverId}/edit`} className="hover:underline">
                {counterpart?.name}
              </Link>
            )}
            <span className="block text-muted-foreground">
              {edge.environments.map((environment) => environment.name).join(', ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
