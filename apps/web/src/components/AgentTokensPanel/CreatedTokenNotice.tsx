'use client';

import type { AgentTokenCreated } from '@cairn/shared';
import { useState } from 'react';

/** Пропсы блока с только что созданным токеном. */
interface IProps {
  createdToken: AgentTokenCreated;
}

/** Конфигурация MCP-клиента для вставки в настройки агента. */
function clientConfig(createdToken: AgentTokenCreated): string {
  return JSON.stringify(
    {
      url: createdToken.mcpUrl,
      headers: { Authorization: `Bearer ${createdToken.token}` },
    },
    null,
    2,
  );
}

/** Открытое значение токена: показывается один раз, с конфигурацией клиента. */
export function CreatedTokenNotice({ createdToken }: IProps) {
  const [isCopied, setIsCopied] = useState(false);

  return (
    <div className="space-y-2 rounded-md border border-primary bg-muted p-3">
      <p className="text-sm font-medium">
        Токен «{createdToken.label}» создан. Он больше не будет показан — сохраните сейчас.
      </p>
      <div className="flex items-center gap-2">
        <code className="break-all rounded bg-background px-2 py-1 text-sm">
          {createdToken.token}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(createdToken.token);
            setIsCopied(true);
          }}
          className="rounded-md border px-3 py-1 text-sm"
        >
          {isCopied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">Конфигурация MCP-клиента:</p>
      <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
        {clientConfig(createdToken)}
      </pre>
    </div>
  );
}
