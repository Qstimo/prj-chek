'use client';

import type { IssuedLinkResponse } from '@cairn/shared';
import { useState } from 'react';

import { describeApiError } from '@/api';
import { useMutationInviteUser } from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { IssuedLink } from '@/components/IssuedLink';
import { UserForm } from '@/components/UserForm';

import { EMPTY_USER } from './constants';

/**
 * Создание учётки в выезжающей панели.
 *
 * Пароля здесь нет: приглашение выдаёт одноразовую ссылку, и показать её
 * нужно в той же панели — другого раза не будет.
 */
export function NewUserPanel() {
  const invite = useMutationInviteUser();
  const [isOpen, setIsOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedLinkResponse | null>(null);

  function close(): void {
    setIsOpen(false);
    setIssued(null);
    invite.reset();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Новый пользователь
      </button>

      <Drawer isOpen={isOpen} onClose={close} title="Новый пользователь" width={DrawerWidth.Half}>
        {issued ? (
          <IssuedLink link={issued} title="Приглашение создано" />
        ) : (
          <UserForm
            initial={EMPTY_USER}
            submitLabel="Пригласить"
            isSubmitting={invite.isPending}
            error={describeApiError(invite.error)}
            onSubmit={(values) => invite.mutate(values, { onSuccess: setIssued })}
          />
        )}
      </Drawer>
    </>
  );
}
