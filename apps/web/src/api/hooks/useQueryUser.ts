'use client';

import type { UserRow } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';
import { USER_KEYS } from './useQueryUsers';

/** Паспорт одного пользователя. Доступен только суперадмину (спека 8). */
export function useQueryUser(userId: string) {
  return useQuery({
    queryKey: USER_KEYS.one(userId),
    queryFn: () => apiClient<UserRow>(`/users/${userId}`),
  });
}
