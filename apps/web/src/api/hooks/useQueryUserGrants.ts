'use client';

import type { UserGrantRow } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша выдач человека. */
export const USER_GRANT_KEYS = {
  forUser: (userId: string) => ['user-grants', userId] as const,
};

/** Матрица «проект × секция» одного человека. */
export function useQueryUserGrants(userId: string) {
  return useQuery({
    queryKey: USER_GRANT_KEYS.forUser(userId),
    queryFn: () => apiClient<UserGrantRow[]>(`/users/${userId}/grants`),
  });
}
