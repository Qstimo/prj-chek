import type { UserRow } from '@cairn/shared';
import Link from 'next/link';

import { statusOf } from './utils';

/** Пропсы строки пользователя. */
interface IProps {
  user: UserRow;
}

/** Строка списка: имя, адрес, состояние и переход на карточку. */
export function UserListItem({ user }: IProps) {
  return (
    <li className="rounded-lg border border-border bg-surface">
      <Link
        href={`/users/${user.id}`}
        className="flex flex-wrap items-center justify-between gap-3 p-3"
      >
        <span>
          <span className="font-medium">
            {user.name}
            {user.isSuperadmin && (
              <span className="ml-2 text-xs text-muted-foreground">Суперадмин</span>
            )}
          </span>
          <span className="block text-sm text-muted-foreground">{user.email}</span>
        </span>

        <span className="text-sm text-muted-foreground">{statusOf(user)}</span>
      </Link>
    </li>
  );
}
