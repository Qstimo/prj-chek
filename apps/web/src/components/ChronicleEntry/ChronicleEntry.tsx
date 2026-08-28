'use client';

import type { ChronicleDetail, ChronicleMetadata } from '@cairn/shared';

import { SOURCE_LABELS } from './constants';
import { EntryActions } from './EntryActions';
import type { IProps } from './types';

/** Запись хроники: состав полей задан уровнем доступа (ТЗ 4.3). */
export function ChronicleEntry({ entry, canWrite = false, onEdit, onDelete }: IProps) {
  const detail = isDetailed(entry) ? entry : null;

  return (
    <article className="space-y-2 rounded-md border border-border p-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <time dateTime={entry.occurredOn} className="text-sm text-muted-foreground">
            {formatDate(entry.occurredOn)}
          </time>
          <h3 className="text-lg font-medium">{entry.title}</h3>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-xs">{SOURCE_LABELS[entry.source]}</span>
      </header>

      {detail && <p className="whitespace-pre-wrap">{detail.content}</p>}

      {canWrite && <EntryActions onEdit={onEdit} onDelete={onDelete} />}
    </article>
  );
}

/** Дата события в привычном для чтения виде. */
function formatDate(occurredOn: string): string {
  return new Date(`${occurredOn}T00:00:00`).toLocaleDateString('ru-RU');
}

/** Отличает проекцию чтения от проекции метаданных. */
function isDetailed(entry: ChronicleMetadata | ChronicleDetail): entry is ChronicleDetail {
  return 'content' in entry;
}
