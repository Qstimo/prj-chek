'use client';

import type { ProjectStatus } from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ApiError } from '../errors';

/** Ключи кэша статусов. */
export const STATUS_KEYS = {
  forProject: (projectId: string) => ['status', projectId] as const,
};

/**
 * Статус проекта. Отсутствие доступа к инфраструктуре — обычное
 * состояние экрана, а не ошибка загрузки: превращается в `null`.
 */
export function useQueryProjectStatus(projectId: string) {
  return useQuery({
    queryKey: STATUS_KEYS.forProject(projectId),
    retry: false,
    queryFn: async (): Promise<ProjectStatus | null> => {
      try {
        return await apiClient<ProjectStatus>(`/projects/${projectId}/status`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return null;
        }

        throw cause;
      }
    },
  });
}

/** Ручной запуск всех проверок. Право суперадмина. */
export function useMutationRunChecks() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient('/status/run', { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['status'] });
    },
  });
}
