'use client';

import { DOMAIN_RENEWAL_WARN_DAYS, type DomainRow, type DomainSubdomain } from '@cairn/shared';
import Link from 'next/link';

import { pluralProjects, pluralSubdomains } from '@/utils';

import { PaidUntilBadge } from '../PaidUntilBadge';
import { StatusIndicator } from '../StatusIndicator';
import { SubdomainListItem } from './SubdomainListItem';

/** Пропсы строки реестра доменов. */
interface IProps {
  domain: DomainRow;
  onRequestDelete: (id: string) => void;
  onRequestDeleteSubdomain: (subdomain: DomainSubdomain) => void;
}

/**
 * Строка реестра доменов вместе с растущими из корня адресами.
 *
 * Поддомены показываются всегда, без раскрытия: их у корня единицы, а
 * прячущий их треугольник заставлял бы открывать каждый корень, чтобы
 * ответить на вопрос «где вообще живёт этот адрес».
 */
export function DomainListItem({ domain, onRequestDelete, onRequestDeleteSubdomain }: IProps) {
  return (
    <li className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
      </div>

      {domain.subdomains.length > 0 && (
        <ul className="border-l border-border pl-4">
          {domain.subdomains.map((subdomain) => (
            <SubdomainListItem
              key={subdomain.id}
              subdomain={subdomain}
              root={domain.name}
              onRequestDelete={onRequestDeleteSubdomain}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
