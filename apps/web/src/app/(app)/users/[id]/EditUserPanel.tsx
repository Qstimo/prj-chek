'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { describeApiError } from '@/api';
import { useMutationUpdateUser } from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { UserForm, type UserFormValues } from '@/components/UserForm';

/** Пропсы панели правки учётки. */
interface IProps {
  userId: string;
  initial: UserFormValues;
  /** Это карточка того, кто правит: смена почты завершит его собственный вход. */
  isSelf: boolean;
}

/**
 * Правка имени и почты в выезжающей панели.
 *
 * Форма та же, что при приглашении: поля совпадают, и расходиться им
 * незачем.
 *
 * Смена почты завершает сессии — сменился логин. На своей карточке это
 * значит собственный выход, поэтому он предсказан подписью и завершён
 * переходом на вход: иначе следующий запрос молча отвечал бы `401`.
 */
export function EditUserPanel({ userId, initial, isSelf }: IProps) {
  const router = useRouter();
  const mutation = useMutationUpdateUser(userId);
  const [isOpen, setIsOpen] = useState(false);

  function close(): void {
    setIsOpen(false);
    // Отказ сервера уходит вместе с панелью: иначе свежая форма
    // открылась бы с прошлой ошибкой.
    mutation.reset();
  }

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
        onClose={close}
        title="Правка пользователя"
        width={DrawerWidth.Half}
      >
        {isSelf && (
          <p className="text-sm text-muted-foreground">
            Это ваша учётная запись. Смена почты завершит ваш вход — придётся войти заново
            с новым адресом.
          </p>
        )}

        <UserForm
          initial={initial}
          submitLabel="Сохранить"
          isSubmitting={mutation.isPending}
          error={describeApiError(mutation.error)}
          onSubmit={(values) =>
            mutation.mutate(values, {
              onSuccess: () => {
                if (isSelf && values.email !== initial.email) {
                  router.replace('/login');

                  return;
                }

                close();
              },
            })
          }
        />
      </Drawer>
    </>
  );
}
