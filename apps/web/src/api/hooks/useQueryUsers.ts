'use client';

import type { UserRow } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша пользователей. */
export const USER_KEYS = {
  all: ['users'] as const,
};

/** Список пользователей. Доступен только суперадмину (спека 8). */
export function useQueryUsers() {
  return useQuery({
    queryKey: USER_KEYS.all,
    queryFn: () => apiClient<UserRow[]>('/users'),
  });
}
