'use client';

import type { IssuedLinkResponse } from '@cairn/shared';
import { useState } from 'react';

import { ApiError } from '@/api';
import { useMutationResetPassword, useMutationUserAction, useQueryUser } from '@/api/hooks';
import { IssuedLink } from '@/components/IssuedLink';
import { UserCard } from '@/components/UserCard';

import { SUPERADMIN_ONLY } from '../constants';
import { EditUserPanel } from './EditUserPanel';
import { UserGrantsPanel } from './UserGrantsPanel';

/** Пропсы экрана учётной записи. */
interface IProps {
  userId: string;
  /** Субъект того, кто смотрит: карточка может оказаться его собственной. */
  currentSubjectId: string;
}

/**
 * Карточка человека: паспорт, действия и доступы.
 *
 * Выданная ссылка показывается под карточкой: сброс пароля отдаёт её
 * единственный раз, и спрятать её в панели действий нельзя.
 */
export function UserScreen({ userId, currentSubjectId }: IProps) {
  const user = useQueryUser(userId);
  const resetPassword = useMutationResetPassword();
  const action = useMutationUserAction();
  const [issued, setIssued] = useState<IssuedLinkResponse | null>(null);

  if (user.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (user.isError) {
    return (
      <p role="alert" className="text-destructive">
        {user.error instanceof ApiError && user.error.status === 403
          ? SUPERADMIN_ONLY
          : 'Не удалось загрузить пользователя.'}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <UserCard
        user={user.data}
        editSlot={
          <EditUserPanel
            userId={userId}
            isSelf={user.data.subjectId === currentSubjectId}
            initial={{ name: user.data.name, email: user.data.email }}
          />
        }
        onRevoke={(id) => action.mutate({ userId: id, action: 'revoke' })}
        onRestore={(id) => action.mutate({ userId: id, action: 'restore' })}
        onResetTotp={(id) => action.mutate({ userId: id, action: 'reset-totp' })}
        onResetPassword={(id) => resetPassword.mutate(id, { onSuccess: setIssued })}
      />

      {issued && <IssuedLink link={issued} title="Пароль сброшен" />}

      <UserGrantsPanel user={user.data} />
    </div>
  );
}
