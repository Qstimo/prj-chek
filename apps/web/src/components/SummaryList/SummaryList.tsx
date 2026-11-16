'use client';

import Link from 'next/link';

import { formatDate } from '@/utils';

import { COLUMNS, LIST_TEXTS, stateOf } from './constants';
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
              <td className="px-3 py-2 tabular-nums">{item.taskCount}</td>
              <td className="px-3 py-2">
                {!item.isReleased ? (
                  stateOf(item.taskCount)
                ) : item.releasedVersionLabel === null ? (
                  LIST_TEXTS.releasedHidden
                ) : (
                  <Link href={`/projects/${item.projectId}/roadmap`} className="hover:underline">
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
