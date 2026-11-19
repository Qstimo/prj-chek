'use client';

import Link from 'next/link';

import { formatDate } from '@/utils';

import { COLUMNS, LIST_TEXTS, countsNoteOf, stateOf } from './constants';
import type { IProps } from './types';

/**
 * История саммари: дата, заголовок, проект, задач, состояние.
 *
 * Состояние вычисляется из содержимого, а не читается из колонки:
 * хранимая стадия разошлась бы с содержимым при первом же удалении
 * последней задачи (дизайн, раздел 2.1).
 */
export function SummaryList({ items }: IProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{LIST_TEXTS.empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {COLUMNS.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border/50">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                {formatDate(item.occurredOn)}
              </td>
              <td className="px-3 py-2">
                <Link href={`/summaries/${item.id}`} className="hover:underline">
                  {item.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{item.projectName}</td>
              {/* Три числа одной строкой, а не одно: после архива и
                  выборочного релиза «задач: 3» не говорит, где эти
                  задачи (дизайн, 3.8). */}
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{countsNoteOf(item)}</td>
              <td className="px-3 py-2">
                {/* Обозначение и идентификатор версии выходят по одному
                    правилу видимости, поэтому проверяются вместе: ссылка
                    без идентификатора вела бы на полосу целиком, а
                    обозначение без него не бывает. */}
                {!item.isReleased ? (
                  stateOf(item)
                ) : item.releasedVersionLabel === null || item.releasedVersionId === null ? (
                  LIST_TEXTS.releasedHidden
                ) : (
                  <Link
                    href={`/projects/${item.projectId}/roadmap?version=${item.releasedVersionId}`}
                    className="hover:underline"
                  >
                    {`Ушло в ${item.releasedVersionLabel}`}
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
