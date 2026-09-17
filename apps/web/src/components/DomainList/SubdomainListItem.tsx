'use client';

import type { DomainSubdomain } from '@cairn/shared';
import Link from 'next/link';

import { SubdomainName } from '../SubdomainName';

/** Пропсы строки поддомена. */
interface IProps {
  subdomain: DomainSubdomain;
  /** Корень, под которым растёт адрес: в имени он приглушается. */
  root: string;
  onRequestDelete: (subdomain: DomainSubdomain) => void;
}

/**
 * Строка поддомена под его корнем.
 *
 * Проект и окружение — ссылки: реестр отвечает на вопрос «чей это адрес»,
 * и путь от адреса к проекту должен быть в один переход.
 */
export function SubdomainListItem({ subdomain, root, onRequestDelete }: IProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-1 text-sm">
      <SubdomainName name={subdomain.name} root={root} />

      <div className="flex items-center gap-3 text-muted-foreground">
        <Link href={`/projects/${subdomain.projectId}`} className="hover:underline">
          {subdomain.projectName}
        </Link>
        <Link
          href={`/projects/${subdomain.projectId}/infrastructure`}
          className="hover:underline"
        >
          {subdomain.environmentName}
        </Link>
        <button
          type="button"
          aria-label={`Убрать ${subdomain.name}`}
          onClick={() => onRequestDelete(subdomain)}
          className="rounded-md border border-border px-2 leading-6"
        >
          ×
        </button>
      </div>
    </li>
  );
}
