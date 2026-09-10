'use client';

import type { DomainMap } from '@cairn/shared';
import Link from 'next/link';

/** Пропсы списка связей узла. */
interface IProps {
  map: DomainMap;
  selectedId: string;
  /** Выделен корень: перечисляем его проекты. Иначе — корни проекта. */
  isDomain: boolean;
}

/** Что связано с выделенным узлом: проекты корня либо корни проекта. */
export function PlacementList({ map, selectedId, isDomain }: IProps) {
  const edges = map.edges.filter((edge) =>
    isDomain ? edge.domainId === selectedId : edge.projectId === selectedId,
  );

  if (edges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {isDomain ? 'Поддоменов пока нет.' : 'У проекта нет доменов.'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {edges.map((edge) => {
        const counterpart = isDomain
          ? map.projects.find((project) => project.id === edge.projectId)
          : map.domains.find((domain) => domain.id === edge.domainId);

        return (
          <li key={`${edge.domainId}-${edge.projectId}`} className="text-sm">
            <Link
              href={isDomain ? `/projects/${edge.projectId}` : `/domains/${edge.domainId}/edit`}
              className="hover:underline"
            >
              {counterpart?.name}
            </Link>
            <span className="block text-muted-foreground">
              {edge.subdomains.map((subdomain) => subdomain.name).join(', ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
