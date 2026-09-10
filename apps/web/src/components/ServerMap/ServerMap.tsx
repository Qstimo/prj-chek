'use client';

import { useEffect, useMemo, useState } from 'react';

import { ServerCard } from '../ServerCard';
import { ZOOM } from './constants';
import { MapEdges } from './MapEdges';
import { MapNode } from './MapNode';
import type { IProps } from './types';
import { layoutServerGraph } from './utils';

/**
 * Интерактивная карта «серверы → проекты» (спека этапа 9, раздел 6).
 *
 * Рёбра рисует SVG, узлы — слой кнопок поверх него. Масштаб меняет один
 * `transform` на обёртке: пересчитывать координаты узлов при зуме значило
 * бы делать раскладку зависимой от состояния интерфейса.
 */
export function ServerMap({ map }: IProps) {
  const layout = useMemo(() => layoutServerGraph(map), [map]);
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
    return <p className="text-muted-foreground">Ни одно окружение не привязано к серверу.</p>;
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
                isSelected={selectedId === node.id}
                isDimmed={selectedId !== null && !isLinked(layout.edges, selectedId, node.id)}
                onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedId && (
        <ServerCard map={map} selectedId={selectedId} onClose={() => setSelectedId(null)} />
      )}
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
  edges: { serverId: string; projectId: string }[],
  selectedId: string,
  nodeId: string,
): boolean {
  return (
    nodeId === selectedId ||
    edges.some(
      (edge) =>
        (edge.serverId === selectedId && edge.projectId === nodeId) ||
        (edge.projectId === selectedId && edge.serverId === nodeId),
    )
  );
}

/** Держит масштаб в допустимых пределах. */
function clamp(zoom: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, Number(zoom.toFixed(2))));
}
