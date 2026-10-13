'use client';

import type { UserRow, UserUpdate } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { USER_KEYS } from './useQueryUsers';

/**
 * Правка имени и почты.
 *
 * Гасится и карточка, и список: имя показывается в обоих местах.
 */
export function useMutationUpdateUser(userId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: UserUpdate) =>
      apiClient<UserRow>(`/users/${userId}`, { method: 'PATCH', body: input }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: USER_KEYS.one(userId) }),
        client.invalidateQueries({ queryKey: USER_KEYS.all }),
      ]);
    },
  });
}
