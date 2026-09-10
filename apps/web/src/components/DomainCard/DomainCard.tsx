'use client';

import { DOMAIN_RENEWAL_WARN_DAYS } from '@cairn/shared';
import Link from 'next/link';

import { PaidUntilBadge } from '../PaidUntilBadge';
import { StatusIndicator } from '../StatusIndicator';
import { PlacementList } from './PlacementList';
import type { IProps } from './types';

/**
 * Панель выделенного узла карты доменов.
 *
 * Одна панель на оба вида узлов: у корня и у проекта показывается одно
 * и то же — статус и что с чем связано.
 */
export function DomainCard({ map, selectedId, onClose }: IProps) {
  const domain = map.domains.find((candidate) => candidate.id === selectedId);
  const project = map.projects.find((candidate) => candidate.id === selectedId);

  if (!domain && !project) {
    return null;
  }

  return (
    <aside className="w-full space-y-3 rounded-md border border-border p-4 lg:w-80">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-medium">{domain?.name ?? project?.name}</h2>
          {domain?.owner && <p className="text-sm text-muted-foreground">{domain.owner}</p>}
          <StatusIndicator indicator={domain?.indicator ?? project!.indicator} />
        </div>
        <button type="button" onClick={onClose} className="text-sm hover:underline">
          Закрыть
        </button>
      </div>

      {domain && (
        <>
          <PaidUntilBadge paidUntil={domain.paidUntil} warnDays={DOMAIN_RENEWAL_WARN_DAYS} />
          {domain.warnings.map((warning) => (
            <p key={warning.detail} className="text-sm text-amber-600 dark:text-amber-500">
              {warning.detail}
            </p>
          ))}
          <Link href={`/domains/${domain.id}/edit`} className="block text-sm hover:underline">
            Править домен
          </Link>
        </>
      )}

      <PlacementList map={map} selectedId={selectedId} isDomain={Boolean(domain)} />
    </aside>
  );
}
