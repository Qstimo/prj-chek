'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { sendGrantChange, type GrantChange } from '../grant-change';
import { GRANT_KEYS } from './useQueryGrants';

/** Установка и отзыв уровня доступа на экране проекта. */
export function useMutationSetGrant(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (change: GrantChange) => sendGrantChange(projectId, change),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: GRANT_KEYS.forProject(projectId) });
    },
  });
}
