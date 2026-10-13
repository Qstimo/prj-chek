'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { sendGrantChange, type GrantChange } from '../grant-change';
import { GRANT_KEYS } from './useQueryGrants';
import { USER_GRANT_KEYS } from './useQueryUserGrants';

/** Изменение ячейки на карточке человека: проект приходит с вызовом. */
export function useMutationSetUserGrant(userId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, change }: { projectId: string; change: GrantChange }) =>
      sendGrantChange(projectId, change),
    // Гасятся оба среза: та же строка видна и на экране проекта.
    onSuccess: async (_result, { projectId }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: USER_GRANT_KEYS.forUser(userId) }),
        client.invalidateQueries({ queryKey: GRANT_KEYS.forProject(projectId) }),
      ]);
    },
  });
}
