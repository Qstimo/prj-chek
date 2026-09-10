'use client';

import type { ServerRow } from '@cairn/shared';
import Link from 'next/link';

import { PaidUntilBadge } from '../PaidUntilBadge';
import { StatusIndicator } from '../StatusIndicator';
import { pluralProjects } from './utils';

/** Пропсы строки реестра. */
interface IProps {
  server: ServerRow;
  onRequestDelete: (id: string) => void;
}

/** Строка реестра серверов. */
export function ServerListItem({ server, onRequestDelete }: IProps) {
  const address = [server.provider, server.host ?? server.ip].filter(Boolean).join(' · ');

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4">
      <div className="space-y-1">
        <Link href={`/servers/${server.id}/edit`} className="font-medium hover:underline">
          {server.name}
        </Link>
        {server.owner && <p className="text-sm">{server.owner}</p>}
        <p className="text-sm text-muted-foreground">{address || 'Параметры не заполнены'}</p>
        <PaidUntilBadge paidUntil={server.paidUntil} />
      </div>

      <div className="flex items-center gap-4">
        <StatusIndicator indicator={server.indicator} />
        <span className="text-sm text-muted-foreground">{pluralProjects(server.projectCount)}</span>
        <button
          type="button"
          onClick={() => onRequestDelete(server.id)}
          className="rounded-md border border-border px-3 py-1 text-sm"
        >
          Удалить
        </button>
      </div>
    </li>
  );
}
