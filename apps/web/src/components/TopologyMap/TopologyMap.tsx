'use client';

import { useEffect, useMemo, useState } from 'react';

import { ZOOM } from './constants';
import { MapEdges } from './MapEdges';
import { MapNode } from './MapNode';
import type { IProps } from './types';
import { layoutTopology } from './utils';

/**
 * Интерактивная карта двухколоночного графа (спека этапа 9, раздел 6).
 *
 * Рёбра рисует SVG, узлы — слой кнопок поверх него. Масштаб меняет один
 * `transform` на обёртке: пересчитывать координаты узлов при зуме значило
 * бы делать раскладку зависимой от состояния интерфейса.
 *
 * Что именно в узлах — решает вызывающая сторона: карта серверов и карта
 * доменов различаются только данными и панелью.
 */
export function TopologyMap({
  graph,
  leftKindLabel,
  rightKindLabel,
  emptyText,
  renderPanel,
}: IProps) {
  const layout = useMemo(() => layoutTopology(graph), [graph]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setSelectedId(null);
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (layout.nodes.length === 0) {
    return <p className="text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <ZoomButton label="Отдалить" onClick={() => setZoom((z) => clamp(z - ZOOM.step))} />
          <ZoomButton label="Приблизить" onClick={() => setZoom((z) => clamp(z + ZOOM.step))} />
        </div>

        <div className="overflow-auto rounded-md border border-border p-2">
          <div
            data-testid="map-canvas"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              width: layout.width,
              height: layout.height,
            }}
            className="relative"
          >
            <MapEdges
              edges={layout.edges}
              width={layout.width}
              height={layout.height}
              selectedId={selectedId}
            />

            {layout.nodes.map((node) => (
              <MapNode
                key={node.id}
                node={node}
                kindLabel={node.side === 'left' ? leftKindLabel : rightKindLabel}
                isSelected={selectedId === node.id}
                isDimmed={selectedId !== null && !isLinked(layout.edges, selectedId, node.id)}
                onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedId && renderPanel(selectedId, () => setSelectedId(null))}
    </div>
  );
}

/** Кнопка масштаба. */
function ZoomButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-border px-3 py-1 text-sm"
    >
      {label}
    </button>
  );
}

/** Связан ли узел с выделенным — сам с собой или ребром. */
function isLinked(
  edges: { leftId: string; rightId: string }[],
  selectedId: string,
  nodeId: string,
): boolean {
  return (
    nodeId === selectedId ||
    edges.some(
      (edge) =>
        (edge.leftId === selectedId && edge.rightId === nodeId) ||
        (edge.rightId === selectedId && edge.leftId === nodeId),
    )
  );
}

/** Держит масштаб в допустимых пределах. */
function clamp(zoom: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, Number(zoom.toFixed(2))));
}
