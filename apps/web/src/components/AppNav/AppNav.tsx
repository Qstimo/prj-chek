'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Drawer } from '@/components/Drawer';

import { ADMIN_LINKS, COMMON_LINKS, SETTINGS_LINK } from './constants';
import type { IProps } from './types';

/** Верхняя навигация. Разделы администрирования видны только суперадмину. */
export function AppNav({ subject, onLogout }: IProps) {
  const links = subject.isSuperadmin ? [...COMMON_LINKS, ...ADMIN_LINKS] : COMMON_LINKS;
  // В меню «Настройки» идут вместе с разделами: правого угла, в котором
  // им место в полосе, на телефоне нет вовсе.
  const menuLinks = subject.isSuperadmin ? [...links, SETTINGS_LINK] : links;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-surface backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-6">
        <Link
          href="/"
          aria-label="CAIRN — главная"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <img src="/cairn-raccoon.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
          <span>cairn</span>
        </Link>

        {/* На телефоне разделы и выход живут в меню, поэтому полоса здесь
            скрыта целиком, а не переносится второй строкой: разделы
            занимали её больше, чем сам экран. */}
        <ul className="hidden flex-wrap gap-4 sm:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-sm hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {/* Настройки открывают, когда что-то не работает, а не чтобы
              работать, — поэтому они здесь, а не пунктом слева. */}
          {subject.isSuperadmin && (
            <Link href={SETTINGS_LINK.href} className="hidden text-sm hover:underline sm:inline">
              {SETTINGS_LINK.label}
            </Link>
          )}
          <span className="hidden text-sm text-muted-foreground sm:inline">{subject.label}</span>
          <button
            type="button"
            onClick={onLogout}
            className="hidden text-sm hover:underline sm:inline"
          >
            Выйти
          </button>

          {/* Кнопка меню — только на телефоне, в правом верхнем углу
              на уровне с лого. */}
          <button
            type="button"
            aria-label="Меню"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen(true)}
            className="rounded-md border border-border px-2.5 py-1.5 text-sm sm:hidden"
          >
            <span aria-hidden="true" className="block space-y-1">
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
            </span>
          </button>
        </div>
      </div>

      {/*
        Меню — та же выезжающая панель, что у форм: фокус-ловушка, Esc,
        клик по подложке и блокировка прокрутки уже в ней, и заводить
        второй такой механизм ради навигации незачем.

        Содержимое рисуется только открытым (Radix размонтирует закрытый
        диалог), поэтому разделы задвоены в разметке лишь пока меню
        открыто, а не постоянно.
      */}
      <Drawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} title="Меню">
        <ul className="space-y-1">
          {menuLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                // Переход внутри приложения панель не размонтирует:
                // навигация живёт в разметке раздела и переживает смену
                // страницы, поэтому меню закрывается вручную.
                onClick={() => setIsMenuOpen(false)}
                className="block rounded-md px-3 py-2.5 hover:bg-surface-strong"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="space-y-3 border-t border-border pt-4">
          {/* Почта здесь, а не в полосе: на телефоне адрес длиннее
              остатка строки и сдвинул бы кнопку меню из угла. */}
          <p className="px-3 text-sm text-muted-foreground">{subject.label}</p>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onLogout();
            }}
            className="w-full rounded-md border border-border px-3 py-2.5 text-left hover:bg-surface-strong"
          >
            Выйти
          </button>
        </div>
      </Drawer>
    </nav>
  );
}
