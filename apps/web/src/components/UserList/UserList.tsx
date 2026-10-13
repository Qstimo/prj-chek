import type { IProps } from './types';
import { UserListItem } from './UserListItem';

/**
 * Список пользователей: обзор и переход на карточку.
 *
 * Действий здесь нет — они живут на карточке. Два места с одними и теми
 * же кнопками однажды разошлись бы.
 */
export function UserList({ users }: IProps) {
  return (
    <ul className="space-y-2">
      {users.map((user) => (
        <UserListItem key={user.id} user={user} />
      ))}
    </ul>
  );
}
