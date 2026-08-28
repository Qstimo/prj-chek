'use client';

import type { RevealResponse, Variable } from '@cairn/shared';
import { useState } from 'react';

/** Пропсы строки переменной. */
interface IProps {
  variable: Variable;
  canReveal: boolean;
  canWrite: boolean;
  onReveal: (id: string) => Promise<RevealResponse>;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
}

/**
 * Строка переменной: значение появляется только по явному запросу
 * и живёт лишь в состоянии компонента — в разметке списка его нет.
 */
export function VariableRow({
  variable,
  canReveal,
  canWrite,
  onReveal,
  onEdit,
  onDelete,
  onHistory,
}: IProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  async function reveal(): Promise<void> {
    const response = await onReveal(variable.id);
    setRevealed(response.value);
  }

  return (
    <li className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <code className="font-medium">{variable.key}</code>
        <span className="rounded bg-muted px-2 py-0.5 text-xs">v{variable.currentVersion}</span>
        {variable.description && (
          <span className="text-sm text-muted-foreground">{variable.description}</span>
        )}
      </div>

      {revealed !== null && (
        <div className="flex items-center gap-2">
          <code className="break-all rounded bg-muted px-2 py-1 text-sm">{revealed}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(revealed)}
            className="rounded-md border px-2 py-1 text-xs"
          >
            Скопировать
          </button>
          <button
            type="button"
            onClick={() => setRevealed(null)}
            className="rounded-md border px-2 py-1 text-xs"
          >
            Скрыть
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canReveal && revealed === null && (
          <button type="button" onClick={reveal} className="rounded-md border px-3 py-1 text-sm">
            Раскрыть
          </button>
        )}
        {canReveal && (
          <button type="button" onClick={onHistory} className="rounded-md border px-3 py-1 text-sm">
            История
          </button>
        )}
        {canWrite && (
          <button type="button" onClick={onEdit} className="rounded-md border px-3 py-1 text-sm">
            Править
          </button>
        )}
        {canWrite &&
          (isConfirming ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
              >
                Подтвердить удаление
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="rounded-md border px-3 py-1 text-sm"
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              className="rounded-md border px-3 py-1 text-sm"
            >
              Удалить
            </button>
          ))}
      </div>
    </li>
  );
}
