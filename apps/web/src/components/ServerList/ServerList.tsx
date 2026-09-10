'use client';

import { useState } from 'react';

import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { ServerListItem } from './ServerListItem';
import type { IProps } from './types';

/** Реестр серверов со статусом, сроком оплаты и удалением (спека этапа 9, раздел 7). */
export function ServerList({ servers, onDelete }: IProps) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (servers.length === 0) {
    return <p className="text-muted-foreground">Серверов пока нет.</p>;
  }

  const target = servers.find((server) => server.id === confirming);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {servers.map((server) => (
          <ServerListItem key={server.id} server={server} onRequestDelete={setConfirming} />
        ))}
      </ul>

      {target && (
        <DeleteConfirmDialog
          name={target.name}
          onConfirm={() => {
            onDelete(target.id);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
