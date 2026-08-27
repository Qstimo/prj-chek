'use client';

import type { InviteUserInput, IssuedLinkResponse } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { USER_KEYS } from './useQueryUsers';

/** Приглашение пользователя. Возвращает одноразовую ссылку. */
export function useMutationInviteUser() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: InviteUserInput) =>
      apiClient<IssuedLinkResponse>('/invitations', { method: 'POST', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: USER_KEYS.all });
    },
  });
}

/** Сброс пароля. Возвращает одноразовую ссылку. */
export function useMutationResetPassword() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient<IssuedLinkResponse>(`/users/${userId}/reset-password`, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: USER_KEYS.all });
    },
  });
}

/**
 * Прочие действия над пользователем: отзыв, восстановление, сброс второго фактора.
 *
 * Все три возвращают пустой ответ и различаются только адресом, поэтому
 * собраны в один хук с параметром.
 */
export function useMutationUserAction() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: UserAction }) =>
      apiClient(`/users/${userId}/${action}`, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: USER_KEYS.all });
    },
  });
}

/** Действия над пользователем, не возвращающие ссылку. */
export type UserAction = 'revoke' | 'restore' | 'reset-totp';
