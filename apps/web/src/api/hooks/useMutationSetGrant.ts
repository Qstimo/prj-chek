'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import type { GrantChange } from '../grant-change';
import { GRANT_KEYS } from './useQueryGrants';

/**
 * Установка и отзыв уровня доступа.
 *
 * Отзыв — это отдельный запрос удаления, а не установка «пустого» уровня:
 * в модели данных отсутствие доступа выражается отсутствием строки (спека 4.3).
 */
export function useMutationSetGrant(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (change: GrantChange) => {
      const path = `/projects/${projectId}/grants`;
      const body = { subjectId: change.subjectId, section: change.section };

      if (change.level === null) {
        return apiClient(path, { method: 'DELETE', body });
      }

      return apiClient(path, { method: 'PUT', body: { ...body, level: change.level } });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: GRANT_KEYS.forProject(projectId) });
    },
  });
}
