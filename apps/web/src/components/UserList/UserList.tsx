'use client';

import { useState } from 'react';

import { ResetConfirmDialog } from './ResetConfirmDialog';
import type { IProps } from './types';
import { UserListItem } from './UserListItem';

/** Список пользователей с действиями суперадмина (спека 9.1). */
export function UserList({ users, onRevoke, onRestore, onResetPassword, onResetTotp }: IProps) {
  const [confirmingReset, setConfirmingReset] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {users.map((user) => (
          <UserListItem
            key={user.id}
            user={user}
            onRevoke={onRevoke}
            onRestore={onRestore}
            onResetTotp={onResetTotp}
            onRequestReset={setConfirmingReset}
          />
        ))}
      </ul>

      {confirmingReset && (
        <ResetConfirmDialog
          onConfirm={() => {
            onResetPassword(confirmingReset);
            setConfirmingReset(null);
          }}
          onCancel={() => setConfirmingReset(null)}
        />
      )}
    </div>
  );
}
