import type { IProps } from './types';
import { UserCardActions } from './UserCardActions';
import { statusOf } from './utils';

/**
 * Карточка пользователя: паспорт, состояние и действия.
 *
 * Действия собраны здесь, а не в строке списка: список остался обзором,
 * а два места с одними и теми же кнопками однажды разошлись бы.
 */
export function UserCard({ user, editSlot, ...actions }: IProps) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {user.name}
            {user.isSuperadmin && (
              <span className="ml-2 align-middle text-xs text-muted-foreground">Суперадмин</span>
            )}
          </h2>
          <p className="text-muted-foreground">{user.email}</p>
        </div>

        {editSlot}
      </header>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Состояние:</dt>
          <dd>{statusOf(user)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Второй фактор:</dt>
          <dd>{user.isTotpEnabled ? 'привязан' : 'не привязан'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Заведён:</dt>
          <dd>{new Date(user.createdAt).toLocaleDateString('ru-RU')}</dd>
        </div>
      </dl>

      <UserCardActions user={user} {...actions} />
    </section>
  );
}
