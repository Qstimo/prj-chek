'use client';

import { ApiError } from '@/api';
import { useQueryUsers } from '@/api/hooks';
import { UserList } from '@/components/UserList';

import { NewUserPanel } from './NewUserPanel';
import { SUPERADMIN_ONLY } from './constants';

/**
 * Список людей и приглашение нового.
 *
 * Действия над учёткой переехали на её карточку: список остался обзором,
 * а сброс пароля и отзыв живут там, где виден весь человек.
 */
export function UsersScreen() {
  const users = useQueryUsers();

  if (users.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (users.isError) {
    return (
      <p role="alert" className="text-destructive">
        {users.error instanceof ApiError && users.error.status === 403
          ? SUPERADMIN_ONLY
          : 'Не удалось загрузить список пользователей.'}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <NewUserPanel />
      <UserList users={users.data} />
    </div>
  );
}
