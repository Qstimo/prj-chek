'use client';

import type { DomainRow, DomainSubdomain } from '@cairn/shared';
import { useState } from 'react';

import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { DomainListItem } from './DomainListItem';
import type { IProps } from './types';

/** Реестр корневых доменов деревом: корни со своими адресами. */
export function DomainList({ domains, onDelete, onDeleteSubdomain }: IProps) {
  const [root, setRoot] = useState<DomainRow | null>(null);
  const [subdomain, setSubdomain] = useState<DomainSubdomain | null>(null);

  if (domains.length === 0) {
    return (
      <p className="text-muted-foreground">
        Доменов пока нет. Они появятся сами, когда в окружении будет вписан адрес, — или можно
        завести адрес здесь.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {domains.map((domain) => (
          <DomainListItem
            key={domain.id}
            domain={domain}
            onRequestDelete={() => setRoot(domain)}
            onRequestDeleteSubdomain={setSubdomain}
          />
        ))}
      </ul>

      {root && (
        <DeleteConfirmDialog
          question={`Удалить домен «${root.name}» из реестра? Срок продления перестанет отслеживаться.`}
          onConfirm={() => {
            onDelete(root.id);
            setRoot(null);
          }}
          onCancel={() => setRoot(null)}
        />
      )}

      {subdomain && (
        <DeleteConfirmDialog
          question={`Убрать адрес «${subdomain.name}» из окружения «${subdomain.environmentName}»? Корень останется в реестре.`}
          onConfirm={() => {
            onDeleteSubdomain(subdomain);
            setSubdomain(null);
          }}
          onCancel={() => setSubdomain(null)}
        />
      )}
    </div>
  );
}
