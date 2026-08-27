'use client';

import { useState } from 'react';

import { useQueryAudit } from '@/api/hooks/useQueryAudit';
import { AuditTable } from '@/components/AuditTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

/**
 * Журнал действий с фильтрами (спека 9.1).
 *
 * Значение фильтра откладывается на 300 мс: без этого каждое нажатие
 * клавиши отправляло бы запрос и создавало новую запись в кэше.
 */
export function AuditScreen() {
  const [action, setAction] = useState('');
  const debouncedAction = useDebouncedValue(action, FILTER_DELAY_MS);
  const audit = useQueryAudit({ action: debouncedAction || undefined });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="action-filter" className="block text-sm font-medium">
          Тип действия
        </label>
        <input
          id="action-filter"
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="например, project.created"
          className="w-full max-w-sm rounded-md border border-border px-3 py-2"
        />
      </div>

      {audit.isPending && <p className="text-muted-foreground">Загрузка…</p>}

      {audit.isError && (
        <p role="alert" className="text-destructive">
          Не удалось загрузить журнал.
        </p>
      )}

      {audit.isSuccess && (
        <>
          <AuditTable entries={audit.data.entries} />
          <p className="text-sm text-muted-foreground">
            Показаны последние {audit.data.entries.length} из {audit.data.total} записей.
          </p>
        </>
      )}
    </div>
  );
}

/** Задержка фильтра. */
const FILTER_DELAY_MS = 300;
