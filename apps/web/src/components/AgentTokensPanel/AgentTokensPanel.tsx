'use client';

import { AgentTokenCreateForm } from './AgentTokenCreateForm';
import { AgentTokenRow } from './AgentTokenRow';
import { CreatedTokenNotice } from './CreatedTokenNotice';
import type { IProps } from './types';

/**
 * Токены агентов проекта (ТЗ 7): выпуск, флаг значений, отзыв.
 *
 * Токен — машинный субъект с профилем «только чтение». Открытое значение
 * показывается единственный раз после создания; в списке — только метаданные.
 */
export function AgentTokensPanel({
  tokens,
  createdToken,
  onCreate,
  onToggleReveal,
  onRevoke,
  isPending = false,
}: IProps) {
  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <h2 className="text-lg font-medium">Токены агентов</h2>

      {createdToken && <CreatedTokenNotice createdToken={createdToken} />}

      {tokens.length > 0 ? (
        <ul className="space-y-2">
          {tokens.map((token) => (
            <AgentTokenRow
              key={token.id}
              token={token}
              onToggleReveal={onToggleReveal}
              onRevoke={onRevoke}
              isPending={isPending}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Токенов пока нет.</p>
      )}

      <AgentTokenCreateForm onCreate={onCreate} isPending={isPending} />
    </section>
  );
}
