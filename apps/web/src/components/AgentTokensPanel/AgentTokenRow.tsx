'use client';

import type { AgentToken } from '@cairn/shared';
import { useState } from 'react';

/** Пропсы строки токена. */
interface IRowProps {
  token: AgentToken;
  onToggleReveal: (tokenId: string, value: boolean) => void;
  onRevoke: (tokenId: string) => void;
  isPending?: boolean;
}

/** Дата в русской локали. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU');
}

/** Строка токена: срок, последний вызов, флаг значений, отзыв с подтверждением. */
export function AgentTokenRow({ token, onToggleReveal, onRevoke, isPending = false }: IRowProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{token.label}</p>
        <p className="text-sm text-muted-foreground">
          до {formatDate(token.expiresAt)} ·{' '}
          {token.lastUsedAt
            ? `последний вызов ${formatDate(token.lastUsedAt)}`
            : 'не вызывался'}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={token.canRevealVariables}
          disabled={isPending}
          onChange={(event) => onToggleReveal(token.id, event.target.checked)}
        />
        Значения переменных
      </label>

      {isConfirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => onRevoke(token.id)}
            className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
          >
            Подтвердить отзыв
          </button>
          <button
            type="button"
            onClick={() => setIsConfirming(false)}
            className="rounded-md border px-3 py-1 text-sm"
          >
            Отмена
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Отозвать
        </button>
      )}
    </li>
  );
}
