'use client';

import Link from 'next/link';

import { PaidUntilBadge } from '../PaidUntilBadge';
import { StatusIndicator } from '../StatusIndicator';
import { PlacementList } from './PlacementList';
import type { IProps } from './types';

/**
 * Панель выделенного узла карты.
 *
 * Одна панель на оба вида узлов: у машины и у проекта показывается одно и
 * то же — статус и что с чем связано, — и два почти одинаковых компонента
 * разошлись бы при первой же правке.
 */
export function ServerCard({ map, selectedId, onClose }: IProps) {
  const server = map.servers.find((candidate) => candidate.id === selectedId);
  const project = map.projects.find((candidate) => candidate.id === selectedId);

  if (!server && !project) {
    return null;
  }

  return (
    <aside className="w-full space-y-3 rounded-md border border-border p-4 lg:w-80">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-medium">{server?.name ?? project?.name}</h2>
          {server?.owner && <p className="text-sm text-muted-foreground">{server.owner}</p>}
          <StatusIndicator indicator={server?.indicator ?? project!.indicator} />
        </div>
        <button type="button" onClick={onClose} className="text-sm hover:underline">
          Закрыть
        </button>
      </div>

      {server && (
        <>
          <PaidUntilBadge paidUntil={server.paidUntil} />
          {server.warnings.map((warning) => (
            <p key={warning.detail} className="text-sm text-amber-600 dark:text-amber-500">
              {warning.detail}
            </p>
          ))}
          <Link href={`/servers/${server.id}/edit`} className="block text-sm hover:underline">
            Править сервер
          </Link>
        </>
      )}

      <PlacementList map={map} selectedId={selectedId} isServer={Boolean(server)} />
    </aside>
  );
}
