'use client';

import type { UserRow } from '@cairn/shared';
import { useState } from 'react';

import { ACTION_LABELS, BUTTON_CLASS } from './constants';
import { ResetConfirmDialog } from './ResetConfirmDialog';
import type { UserActions } from './types';

/** Пропсы полосы действий. */
interface IProps extends UserActions {
  user: UserRow;
}

/**
 * Действия над учёткой.
 *
 * Сброс пароля здесь только запрашивается: подтверждение показывается
 * диалогом, чтобы случайное нажатие не завершило сессии человека.
 */
export function UserCardActions({
  user,
  onRevoke,
  onRestore,
  onResetPassword,
  onResetTotp,
}: IProps) {
  const [isConfirming, setConfirming] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {user.isRevoked ? (
          <button type="button" onClick={() => onRestore(user.id)} className={BUTTON_CLASS}>
            {ACTION_LABELS.restore}
          </button>
        ) : (
          <button type="button" onClick={() => onRevoke(user.id)} className={BUTTON_CLASS}>
            {ACTION_LABELS.revoke}
          </button>
        )}

        <button type="button" onClick={() => setConfirming(true)} className={BUTTON_CLASS}>
          {ACTION_LABELS.resetPassword}
        </button>

        {user.isTotpEnabled && (
          <button type="button" onClick={() => onResetTotp(user.id)} className={BUTTON_CLASS}>
            {ACTION_LABELS.resetTotp}
          </button>
        )}
      </div>

      {isConfirming && (
        <ResetConfirmDialog
          onConfirm={() => {
            onResetPassword(user.id);
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
