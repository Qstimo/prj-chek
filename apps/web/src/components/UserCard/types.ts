import type { UserRow } from '@cairn/shared';
import type { ReactNode } from 'react';

/** Действия над учёткой. Все принимают идентификатор пользователя. */
export interface UserActions {
  onRevoke: (userId: string) => void;
  onRestore: (userId: string) => void;
  onResetPassword: (userId: string) => void;
  onResetTotp: (userId: string) => void;
}

/** Пропсы карточки пользователя. */
export interface IProps extends UserActions {
  user: UserRow;
  /** Кнопка правки с её панелью: карточка не знает, как устроена форма. */
  editSlot?: ReactNode;
}
