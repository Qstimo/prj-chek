'use client';

import Link from 'next/link';

import { ADMIN_LINKS, COMMON_LINKS } from './constants';
import type { IProps } from './types';

/** Верхняя навигация. Разделы администрирования видны только суперадмину. */
export function AppNav({ subject, onLogout }: IProps) {
  const links = subject.isSuperadmin ? [...COMMON_LINKS, ...ADMIN_LINKS] : COMMON_LINKS;

  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-surface backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-6">
          <Link href="/" aria-label="CAIRN — главная" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <img src="/cairn-raccoon.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
            <span>cairn</span>
          </Link>
          <ul className="flex flex-wrap gap-4">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

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
