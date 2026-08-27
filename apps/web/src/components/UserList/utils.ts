import { InvitationKind, type UserRow } from '@cairn/shared';

/**
 * Описывает состояние пользователя человеческими словами.
 *
 * Роль здесь не участвует: суперадмин может быть и отозванным,
 * и приглашённым, и смешение двух признаков скрыло бы одно из них.
 */
export function statusOf(user: UserRow): string {
  if (user.isRevoked) {
    return 'Отозван';
  }

  if (!user.hasPassword) {
    return user.lastLinkKind === InvitationKind.PasswordReset ? 'Пароль сброшен' : 'Приглашён';
  }

  return 'Активен';
}
