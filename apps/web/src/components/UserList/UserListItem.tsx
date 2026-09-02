'use client';

import type { UserRow } from '@cairn/shared';

import { ACTION_LABELS, BUTTON_CLASS } from './constants';
import { statusOf } from './utils';

/** Пропсы строки пользователя. */
interface IProps {
  user: UserRow;
  onRevoke: (userId: string) => void;
  onRestore: (userId: string) => void;
  onRequestReset: (userId: string) => void;
  onResetTotp: (userId: string) => void;
}

/**
 * Строка пользователя со сведениями и действиями.
 *
 * Сброс пароля здесь только запрашивается — само действие подтверждает
 * родитель через диалог, чтобы случайное нажатие не завершило сессии.
 */
export function UserListItem({ user, onRevoke, onRestore, onRequestReset, onResetTotp }: IProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
      <div>
        <p className="font-medium">
          {user.email}
          {user.isSuperadmin && (
            <span className="ml-2 text-xs text-muted-foreground">Суперадмин</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{statusOf(user)}</p>
      </div>

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

        <button type="button" onClick={() => onRequestReset(user.id)} className={BUTTON_CLASS}>
          {ACTION_LABELS.resetPassword}
        </button>

        {user.isTotpEnabled && (
          <button type="button" onClick={() => onResetTotp(user.id)} className={BUTTON_CLASS}>
            {ACTION_LABELS.resetTotp}
          </button>
        )}
      </div>
    </li>
  );
}
