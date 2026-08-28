'use client';

import type { RevealResponse, VariableVersion } from '@cairn/shared';
import { useState } from 'react';

/** Пропсы строки версии. */
interface IProps {
  version: VariableVersion;
  canWrite: boolean;
  onReveal: (versionNo: number) => Promise<RevealResponse>;
  onRollback: (versionNo: number) => void;
}

/** Строка истории: значение — по запросу, откат — с подтверждением. */
export function VersionRow({ version, canWrite, onReveal, onRollback }: IProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <li className="space-y-1 rounded border border-border p-2">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium">v{version.versionNo}</span>
        <span className="text-muted-foreground">
          {new Date(version.createdAt).toLocaleString('ru-RU')} · {version.createdByLabel}
        </span>
      </div>

      {revealed !== null && (
        <code className="block break-all rounded bg-muted px-2 py-1 text-sm">{revealed}</code>
      )}

      <div className="flex gap-2">
        {revealed === null && (
          <button
            type="button"
            onClick={async () => setRevealed((await onReveal(version.versionNo)).value)}
            className="rounded-md border px-2 py-0.5 text-xs"
          >
            Раскрыть
          </button>
        )}
        {canWrite &&
          (isConfirming ? (
            <>
              <button
                type="button"
                onClick={() => onRollback(version.versionNo)}
                className="rounded-md bg-destructive px-2 py-0.5 text-xs text-destructive-foreground"
              >
                Подтвердить откат
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="rounded-md border px-2 py-0.5 text-xs"
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              className="rounded-md border px-2 py-0.5 text-xs"
            >
              Откатить
            </button>
          ))}
      </div>
    </li>
  );
}
