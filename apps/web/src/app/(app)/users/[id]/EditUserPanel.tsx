'use client';

import { useState } from 'react';

import { describeApiError } from '@/api';
import { useMutationUpdateUser } from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { UserForm, type UserFormValues } from '@/components/UserForm';

/** Пропсы панели правки учётки. */
interface IProps {
  userId: string;
  initial: UserFormValues;
}

/**
 * Правка имени и почты в выезжающей панели.
 *
 * Форма та же, что при приглашении: поля совпадают, и расходиться им
 * незачем. Смена почты завершит сессии человека — об этом говорит сервер,
 * а не форма.
 */
export function EditUserPanel({ userId, initial }: IProps) {
  const mutation = useMutationUpdateUser(userId);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md border px-3 py-1 text-sm"
      >
        Править
      </button>

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Правка пользователя"
        width={DrawerWidth.Half}
      >
        <UserForm
          initial={initial}
          submitLabel="Сохранить"
          isSubmitting={mutation.isPending}
          error={describeApiError(mutation.error)}
          onSubmit={(values) =>
            mutation.mutate(values, { onSuccess: () => setIsOpen(false) })
          }
        />
      </Drawer>
    </>
  );
}
