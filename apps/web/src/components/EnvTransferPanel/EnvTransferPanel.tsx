'use client';

import { useState } from 'react';

import { FormError } from '../FormError';
import type { IProps } from './types';

/**
 * Импорт и выгрузка `.env` (ТЗ 3.3).
 *
 * Выгруженный текст показывается на странице, а не скачивается файлом:
 * меньше следов секретов на диске.
 */
export function EnvTransferPanel({
  canWrite = false,
  canReveal = false,
  onImport,
  onExport,
  importResult,
  error,
  isPending = false,
}: IProps) {
  const [draft, setDraft] = useState('');
  const [exported, setExported] = useState<string | null>(null);

  if (!canWrite && !canReveal) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <h2 className="text-lg font-medium">Импорт и выгрузка .env</h2>

      {canWrite && (
        <div className="space-y-2">
          <label htmlFor="env-import" className="block text-sm font-medium">
            Текст .env
          </label>
          <textarea
            id="env-import"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            rows={4}
            className="w-full rounded-md border border-border px-3 py-2 font-mono"
          />
          <button
            type="button"
            disabled={isPending || draft.trim().length === 0}
            onClick={() => onImport(draft)}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            Импортировать
          </button>
          {importResult && (
            <p className="text-sm text-muted-foreground">
              Создано: {importResult.created.length}, обновлено: {importResult.updated.length},
              без изменений: {importResult.unchanged.length}.
            </p>
          )}
        </div>
      )}

      {canReveal && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Выгрузка раскрывает все значения окружения и фиксируется в журнале.
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={async () => setExported(await onExport())}
            className="rounded-md border px-4 py-2 disabled:opacity-50"
          >
            Выгрузить .env
          </button>
          {exported !== null && (
            <textarea
              aria-label="Выгруженный .env"
              readOnly
              value={exported}
              rows={4}
              className="w-full rounded-md border border-border px-3 py-2 font-mono"
            />
          )}
        </div>
      )}

      <FormError message={error} />
    </section>
  );
}
