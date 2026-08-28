'use client';

import { ChronicleEntry } from '../ChronicleEntry';
import type { IProps } from './types';

/** Лента хроники: свежие события сверху (ТЗ 3.6). */
export function ChronicleList({
  entries,
  canWrite = false,
  onEdit,
  onDelete,
  onPromote,
  onPromoteToDoc,
}: IProps) {
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
            onPromote={onPromote ? () => onPromote(entry.id, entry.title) : undefined}
            onPromoteToDoc={
              // Содержимое есть только в проекции чтения: без него
              // поднимать нечего, и кнопка не показывается.
              onPromoteToDoc && 'content' in entry
                ? () => onPromoteToDoc(entry.id, entry.title, entry.content)
                : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}
