'use client';

import { useMemo } from 'react';

import { DomainCard } from '../DomainCard';
import { TopologyMap, type TopologyGraph } from '../TopologyMap';
import type { IProps } from './types';

/**
 * Карта доменов: корни и проекты, которые на них держатся.
 *
 * Вся механика — в `TopologyMap`; здесь только перевод контракта карты
 * доменов в нейтральный граф и своя панель узла.
 */
export function DomainMap({ map }: IProps) {
  const graph = useMemo<TopologyGraph>(
    () => ({
      left: map.domains.map((domain) => ({
        id: domain.id,
        label: domain.name,
        hint: domain.owner,
        indicator: domain.indicator,
      })),
      right: map.projects.map((project) => ({
        id: project.id,
        label: project.name,
        hint: null,
        indicator: project.indicator,
      })),
      edges: map.edges.map((edge) => ({
        leftId: edge.domainId,
        rightId: edge.projectId,
        label: edge.subdomains.map((subdomain) => subdomain.name).join(', '),
      })),
    }),
    [map],
  );

  return (
    <TopologyMap
      graph={graph}
      leftKindLabel="Домен"
      rightKindLabel="Проект"
      emptyText="Ни один домен не привязан к окружению."
      renderPanel={(selectedId, close) => (
        <DomainCard map={map} selectedId={selectedId} onClose={close} />
      )}
    />
  );
}
