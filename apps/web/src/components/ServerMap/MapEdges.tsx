'use client';

import type { LayoutEdge } from './utils';

/** Пропсы слоя рёбер. */
interface IProps {
  edges: LayoutEdge[];
  width: number;
  height: number;
  /** Выделенный узел: его рёбра подсвечиваются, остальные гаснут. */
  selectedId: string | null;
}

/**
 * Слой связей между машинами и проектами.
 *
 * Кривая Безье, а не прямая: при нескольких проектах на одной машине
 * прямые сливались бы в веер, в котором не видно отдельных связей.
 */
export function MapEdges({ edges, width, height, selectedId }: IProps) {
  return (
    <svg width={width} height={height} className="absolute left-0 top-0" aria-hidden>
      {edges.map((edge) => {
        const isActive =
          selectedId === null || selectedId === edge.serverId || selectedId === edge.projectId;
        const middle = (edge.from.x + edge.to.x) / 2;

        return (
          <path
            key={`${edge.serverId}-${edge.projectId}`}
            data-testid={`edge-${edge.serverId}-${edge.projectId}`}
            data-active={String(selectedId !== null && isActive)}
            d={`M ${edge.from.x} ${edge.from.y} C ${middle} ${edge.from.y}, ${middle} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`}
            fill="none"
            strokeWidth={selectedId !== null && isActive ? 2 : 1}
            className={
              isActive ? 'stroke-border-strong' : 'stroke-border opacity-30'
            }
          />
        );
      })}
    </svg>
  );
}
