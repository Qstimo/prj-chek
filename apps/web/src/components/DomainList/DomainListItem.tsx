'use client';

import { DOMAIN_RENEWAL_WARN_DAYS, type DomainRow } from '@cairn/shared';
import Link from 'next/link';

import { pluralProjects, pluralSubdomains } from '@/utils';

import { PaidUntilBadge } from '../PaidUntilBadge';
import { StatusIndicator } from '../StatusIndicator';

/** Пропсы строки реестра доменов. */
interface IProps {
  domain: DomainRow;
  onRequestDelete: (id: string) => void;
}

/** Строка реестра доменов. */
export function DomainListItem({ domain, onRequestDelete }: IProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4">
      <div className="space-y-1">
        <Link href={`/domains/${domain.id}/edit`} className="font-medium hover:underline">
          {domain.name}
        </Link>
        {domain.owner && <p className="text-sm">{domain.owner}</p>}
        <p className="text-sm text-muted-foreground">
          {domain.registrar ?? 'Регистратор не указан'}
        </p>
        <PaidUntilBadge paidUntil={domain.paidUntil} warnDays={DOMAIN_RENEWAL_WARN_DAYS} />
      </div>

      <div className="flex items-center gap-4">
        <StatusIndicator indicator={domain.indicator} />
        <span className="text-sm text-muted-foreground">
          {pluralSubdomains(domain.subdomainCount)} · {pluralProjects(domain.projectCount)}
        </span>
        <button
          type="button"
          onClick={() => onRequestDelete(domain.id)}
          className="rounded-md border border-border px-3 py-1 text-sm"
        >
          Удалить
        </button>
      </div>
    </li>
  );
}
