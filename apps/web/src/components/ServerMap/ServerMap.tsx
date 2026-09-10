'use client';

import { useMemo } from 'react';

import { ServerCard } from '../ServerCard';
import { TopologyMap, type TopologyGraph } from '../TopologyMap';
import type { IProps } from './types';

/**
 * Карта размещения проектов по серверам (спека этапа 9, раздел 6).
 *
 * Вся механика — в `TopologyMap`; здесь только перевод контракта карты
 * серверов в нейтральный граф и своя панель узла.
 */
export function ServerMap({ map }: IProps) {
  const graph = useMemo<TopologyGraph>(
    () => ({
      left: map.servers.map((server) => ({
        id: server.id,
        label: server.name,
        hint: server.owner,
        indicator: server.indicator,
      })),
      right: map.projects.map((project) => ({
        id: project.id,
        label: project.name,
        hint: null,
        indicator: project.indicator,
      })),
      edges: map.edges.map((edge) => ({
        leftId: edge.serverId,
        rightId: edge.projectId,
        label: edge.environments.map((environment) => environment.name).join(', '),
      })),
    }),
    [map],
  );

  return (
    <TopologyMap
      graph={graph}
      leftKindLabel="Сервер"
      rightKindLabel="Проект"
      emptyText="Ни одно окружение не привязано к серверу."
      renderPanel={(selectedId, close) => (
        <ServerCard map={map} selectedId={selectedId} onClose={close} />
      )}
    />
  );
}
