'use client';

import type { IssuedLinkResponse } from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationInviteUser,
  useMutationResetPassword,
  useMutationUserAction,
  useQueryUsers,
} from '@/api/hooks';
import { InviteForm } from '@/components/InviteForm';
import { IssuedLink } from '@/components/IssuedLink';
import { UserList } from '@/components/UserList';

/** Управление пользователями: приглашение и действия над учётными записями. */
export function UsersScreen() {
  const users = useQueryUsers();
  const invite = useMutationInviteUser();
  const resetPassword = useMutationResetPassword();
  const action = useMutationUserAction();

  const [issued, setIssued] = useState<{ link: IssuedLinkResponse; title: string } | null>(null);

  if (users.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (users.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить список пользователей.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <InviteForm
        onSubmit={(input) =>
          invite.mutate(input, {
            onSuccess: (link) => setIssued({ link, title: 'Приглашение создано' }),
          })
        }
        error={invite.error?.message}
        isSubmitting={invite.isPending}
      />

      {issued && <IssuedLink link={issued.link} title={issued.title} />}

      <UserList
        users={users.data}
        onRevoke={(userId) => action.mutate({ userId, action: 'revoke' })}
        onRestore={(userId) => action.mutate({ userId, action: 'restore' })}
        onResetTotp={(userId) => action.mutate({ userId, action: 'reset-totp' })}
        onResetPassword={(userId) =>
          resetPassword.mutate(userId, {
            onSuccess: (link) => setIssued({ link, title: 'Пароль сброшен' }),
          })
        }
      />
    </div>
  );
}
