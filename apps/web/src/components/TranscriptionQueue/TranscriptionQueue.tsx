'use client';

import { TranscriptionState } from '@cairn/shared';

import { COLUMNS, QUEUE_TEXTS } from './constants';
import { QueueRow } from './QueueRow';
import type { IProps } from './types';

/**
 * Блок «Расшифровки» над историей саммари.
 *
 * Показывается **только когда в нём есть строки**: пустой блок говорил бы
 * о работе, которой нет. Успешные расшифровки сюда не попадают вовсе —
 * саммари появилось в истории ниже, и две строки об одном были бы двумя
 * правдами (дизайн, 8.3). Сервер их и не отдаёт; отбор здесь — вторая
 * охрана, а не повтор проверки.
 *
 * `now` берётся один раз на отрисовку и передаётся всем строкам: иначе
 * две строки одной таблицы считали бы время от разных мигов.
 */
export function TranscriptionQueue({ jobs, onCancel, onRetry, onDelete }: IProps) {
  const shown = jobs.filter((job) => job.state !== TranscriptionState.Done);

  if (shown.length === 0) {
    return null;
  }

  const now = Date.now();

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{QUEUE_TEXTS.heading}</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {COLUMNS.map((column, index) => (
                <th key={index} className="px-3 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((job) => (
              <QueueRow
                key={job.id}
                job={job}
                now={now}
                onCancel={onCancel}
                onRetry={onRetry}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
