'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { PROJECT_SECTIONS } from './constants';
import type { IProps } from './types';
import { isSectionActive } from './utils';

/**
 * Навигация внутри проекта: крошки и разделы.
 *
 * Разделов шесть, и до этого каркаса между ними можно было ходить только
 * кнопкой браузера: страница раздела не сообщала ни проекта, ни выхода
 * наружу. Крошки дают обратный путь, полоса разделов — переход между ними.
 *
 * Показываются только разделы с выдачей: отсутствие уровня означает, что
 * существование секции не раскрывается (ТЗ 4.2), поэтому недоступный раздел
 * отсутствует, а не выглядит заблокированным.
 *
 * Раздел определяется по префиксу адреса, а место в нём — точным
 * равенством: у разделов есть вложенные страницы (отчёт по релизу внутри
 * роадмапа), и на такой странице раздел обязан остаться текущим, но
 * остаться и ссылкой — иначе из вложенного адреса некуда вернуться.
 */
export function ProjectNav({ projectId, projectName, sections }: IProps) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const available = PROJECT_SECTIONS.filter((item) => sections[item.section]);
  const current = available.find((item) =>
    isSectionActive(pathname, `${base}${item.path}`, item.path),
  );
  const isOnProject = pathname === base;
  const isOnSectionRoot = current !== undefined && pathname === `${base}${current.path}`;

  return (
    <nav aria-label="Навигация по проекту" className="space-y-3">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <li>
          <Link href="/" className="hover:underline">
            Проекты
          </Link>
        </li>
        <li aria-hidden>/</li>
        <li>
          {isOnProject ? (
            <span aria-current="page" className="text-foreground">
              {projectName}
            </span>
          ) : (
            <Link href={base} className="hover:underline">
              {projectName}
            </Link>
          )}
        </li>
        {current && !isOnProject && (
          <>
            <li aria-hidden>/</li>
            <li>
              {/*
                На вложенной странице раздел — звено пути, а не текущее
                место: заголовок страницы называет себя сам, а крошка
                обязана вести назад к разделу.
              */}
              {isOnSectionRoot ? (
                <span aria-current="page" className="text-foreground">
                  {current.label}
                </span>
              ) : (
                <Link href={`${base}${current.path}`} className="hover:underline">
                  {current.label}
                </Link>
              )}
            </li>
          </>
        )}
      </ol>

      <ul className="flex flex-wrap gap-2">
        {available.map((item) => {
          const href = `${base}${item.path}`;
          const isCurrent = pathname === href;
          const isActive = item === current;

          // Текущий раздел не ссылка: щёлкать по месту, где уже находишься,
          // незачем, а метка aria-current делает его слышимым. На вложенной
          // странице раздел выделен, но ссылкой остаётся — это путь назад,
          // и `aria-current` там был бы неправдой: текущая страница другая.
          return (
            <li key={item.section}>
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="rounded-full border border-border-strong bg-surface-strong px-3 py-1 text-sm"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={href}
                  className={
                    isActive
                      ? 'rounded-full border border-border-strong bg-surface-strong px-3 py-1 text-sm transition'
                      : 'rounded-full border border-border bg-surface px-3 py-1 text-sm transition hover:border-border-strong hover:bg-surface-strong'
                  }
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
