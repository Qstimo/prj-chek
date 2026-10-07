import type { IProps } from './types';

/**
 * Чипы платформ только на чтение.
 *
 * Без `'use client'` и без крестика: его рендерит серверный паспорт
 * проекта, карточка окружения и строка чекпоинта. Чипы с крестиком
 * живут отдельно, в поле платформ формы проекта.
 */
export function PlatformChips({ platforms }: IProps) {
  if (platforms.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {platforms.map((platform) => (
        <li key={platform.id} className="rounded bg-muted px-2 py-1 text-sm">
          {platform.name}
        </li>
      ))}
    </ul>
  );
}
