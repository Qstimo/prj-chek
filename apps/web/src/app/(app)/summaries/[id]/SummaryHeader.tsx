'use client';

import { formatDate } from '@/utils';

import type { IHeaderProps } from './types';

/**
 * Прилипшая шапка рабочего экрана: паспорт саммари и состояние потока.
 *
 * Прилипает, потому что колонки прокручиваются каждая своим содержимым, и
 * человек, уехавший к концу списка задач, иначе терял бы ответ на «какое
 * саммари я правлю». Состояние потока названо здесь целиком и только
 * здесь — дальше каждый блок говорит о себе (дизайн, 4.1).
 *
 * `top-[4.25rem]` — высота полосы навигации (`p-4` плюс лого `h-9`):
 * шапка встаёт ровно под ней, а не за ней. `-mx-6 px-6` закрывает отбивку
 * страницы, иначе содержимое проезжало бы в щель по краям.
 */
export function SummaryHeader({ projectName, occurredOn, title, badges }: IHeaderProps) {
  return (
    <header className="sticky top-[4.25rem] z-10 -mx-6 border-b border-border bg-background px-6 py-3">
      <p className="text-sm text-muted-foreground">
        {projectName} · {formatDate(occurredOn)}
      </p>

      <h1 className="text-xl font-medium">{title}</h1>

      {/* Пустая полоса бирок не рисуется вовсе: отсутствие бирок и
          означает «всё обычно». */}
      {badges.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <li key={badge} className="rounded-md border border-border px-2 py-0.5 text-xs">
              {badge}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
