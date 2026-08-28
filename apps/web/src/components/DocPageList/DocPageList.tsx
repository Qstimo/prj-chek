'use client';

import type { IProps } from './types';

/** Список страниц документации: заголовки с датами (ТЗ 4.3). */
export function DocPageList({ pages, selectedId, canWrite = false, onSelect }: IProps) {
  if (pages.length === 0) {
    return (
      <p className="text-muted-foreground">
        {canWrite ? 'Страниц пока нет. Создайте первую.' : 'Страниц пока нет.'}
      </p>
    );
  }

  return (
    <ul aria-label="Страницы документации" className="grid gap-1">
      {pages.map((page) => (
        <li key={page.id}>
          <button
            type="button"
            data-selected={page.id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(page.id)}
            className={
              page.id === selectedId
                ? 'w-full rounded-md bg-muted px-3 py-2 text-left'
                : 'w-full rounded-md px-3 py-2 text-left hover:bg-muted'
            }
          >
            <span className="font-medium">{page.title}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {new Date(page.updatedAt).toLocaleDateString('ru-RU')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
