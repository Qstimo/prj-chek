'use client';

import type { PublicLink } from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ApiError } from '../errors';
import { ROADMAP_KEYS } from './useQueryRoadmap';

/**
 * Публичная ссылка роадмапа.
 *
 * Отсутствие публикации и нехватка прав — обычные состояния экрана,
 * а не ошибки загрузки, поэтому превращаются в `null`.
 */
export function useQueryPublicLink(projectId: string) {
  return useQuery({
    queryKey: ROADMAP_KEYS.publicLink(projectId),
    retry: false,
    queryFn: async (): Promise<PublicLink | null> => {
      try {
        return await apiClient<PublicLink>(`/projects/${projectId}/roadmap/public-link`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return null;
        }

        throw cause;
      }
    },
  });
}

/** Публикация роадмапа. Право суперадмина. */
export function useMutationPublishRoadmap(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<PublicLink>(`/projects/${projectId}/roadmap/public-link`, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ROADMAP_KEYS.publicLink(projectId) });
    },
  });
}

/** Отключение публикации: прежняя ссылка гаснет. */
export function useMutationUnpublishRoadmap(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient(`/projects/${projectId}/roadmap/public-link`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ROADMAP_KEYS.publicLink(projectId) });
    },
  });
}
