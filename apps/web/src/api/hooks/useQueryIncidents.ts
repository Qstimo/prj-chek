'use client';

import type { ProjectIncidents } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ApiError } from '../errors';

/** Ключи кэша инцидентов. */
export const INCIDENT_KEYS = {
  forProject: (projectId: string) => ['incidents', projectId] as const,
};

/**
 * Инциденты адресов проекта.
 *
 * Отсутствие доступа к инфраструктуре — обычное состояние экрана, а не
 * ошибка загрузки: превращается в пустой список, как и статус.
 */
export function useQueryIncidents(projectId: string) {
  return useQuery({
    queryKey: INCIDENT_KEYS.forProject(projectId),
    retry: false,
    queryFn: async (): Promise<ProjectIncidents> => {
      try {
        return await apiClient<ProjectIncidents>(`/projects/${projectId}/incidents`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return [];
        }

        throw cause;
      }
    },
  });
}
