import type { IProps } from './types';

/**
 * Чипы тегов только на чтение.
 *
 * Без `'use client'` и без крестика: их рисуют серверный паспорт проекта
 * и строка сводки. Чипы с крестиком живут отдельно, в поле тегов формы
 * проекта.
 *
 * Оформление отличается от чипов платформ намеренно: тег — верхнеуровневая
 * метка, и рядом с платформой он обязан читаться как другая величина, а не
 * как ещё одна платформа.
 */
export function TagChips({ tags }: IProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          key={tag.slug}
          className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground"
        >
          {tag.label}
        </li>
      ))}
    </ul>
  );
}
