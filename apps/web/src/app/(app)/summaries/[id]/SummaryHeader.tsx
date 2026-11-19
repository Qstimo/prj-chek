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
 *
 * `z-20` — середина стопки: под навигацией (`z-30`), но над полосой
 * действий редактора задач (`z-10`), которая прилипает ниже этой шапки.
 *
 * Ссылка наружу нужна затем, что высоту этой шапки нельзя сосчитать
 * заранее: заголовок переносится, а бирок может не быть вовсе. Её
 * измеряет `SummaryBody` и раздаёт нижним слоям.
 */
export function SummaryHeader({ projectName, occurredOn, title, badges, ref }: IHeaderProps) {
  return (
    <header
      ref={ref}
      className="sticky top-[4.25rem] z-20 -mx-6 border-b border-border bg-background px-6 py-3"
    >
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
