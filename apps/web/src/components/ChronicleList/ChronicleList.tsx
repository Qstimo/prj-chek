'use client';

import { ChronicleEntry } from '../ChronicleEntry';
import type { IProps } from './types';

/** Лента хроники: свежие события сверху (ТЗ 3.6). */
export function ChronicleList({ entries, canWrite = false, onEdit, onDelete }: IProps) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground">
        {canWrite
          ? 'Записей пока нет. Добавьте первую запись или перешлите сводку на приёмный адрес.'
          : 'Записей пока нет.'}
      </p>
    );
  }

  return (
    <ul aria-label="Хроника" className="grid gap-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <ChronicleEntry
            entry={entry}
            canWrite={canWrite}
            onEdit={() => onEdit(entry.id)}
            onDelete={() => onDelete(entry.id)}
          />
        </li>
      ))}
    </ul>
  );
}
