import type { UserRow } from '@cairn/shared';

/** Пропсы списка пользователей. */
export interface IProps {
  users: UserRow[];
  onRevoke: (userId: string) => void;
  onRestore: (userId: string) => void;
  onResetPassword: (userId: string) => void;
  onResetTotp: (userId: string) => void;
}
