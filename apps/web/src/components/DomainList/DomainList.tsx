'use client';

import { useState } from 'react';

import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { DomainListItem } from './DomainListItem';
import type { IProps } from './types';

/** Реестр корневых доменов со сроком продления (спека этапа 10, раздел 7). */
export function DomainList({ domains, onDelete }: IProps) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (domains.length === 0) {
    return (
      <p className="text-muted-foreground">
        Доменов пока нет. Они появятся сами, когда в окружении будет вписан адрес.
      </p>
    );
  }

  const target = domains.find((domain) => domain.id === confirming);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {domains.map((domain) => (
          <DomainListItem key={domain.id} domain={domain} onRequestDelete={setConfirming} />
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
