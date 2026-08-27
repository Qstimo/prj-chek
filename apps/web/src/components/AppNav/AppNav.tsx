'use client';

import Link from 'next/link';

import { ADMIN_LINKS, COMMON_LINKS } from './constants';
import type { IProps } from './types';

/** Верхняя навигация. Разделы администрирования видны только суперадмину. */
export function AppNav({ subject, onLogout }: IProps) {
  const links = subject.isSuperadmin ? [...COMMON_LINKS, ...ADMIN_LINKS] : COMMON_LINKS;

  return (
    <nav className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
        <ul className="flex gap-4">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-sm hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{subject.label}</span>
          <button type="button" onClick={onLogout} className="text-sm hover:underline">
            Выйти
          </button>
        </div>
      </div>
    </nav>
  );
}
