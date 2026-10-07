'use client';

import type { Platform, PlatformCreate, PlatformUpdate } from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ROADMAP_KEYS } from './useQueryRoadmap';

/** Ключи кэша платформ. */
export const PLATFORM_KEYS = {
  forProject: (projectId: string) => ['platforms', projectId] as const,
};

/**
 * Платформы проекта по порядку.
 *
 * `enabled` нужен там, где доступа к «Инфо» может не быть, — на экране
 * инфраструктуры: ручка ответит отказом, и бить в неё незачем.
 * `initialData` подставляет список, который страница уже получила на
 * сервере, чтобы не тянуть его второй раз.
 */
export function useQueryPlatforms(
  projectId: string,
  { enabled = true, initialData }: { enabled?: boolean; initialData?: Platform[] } = {},
) {
  return useQuery({
    queryKey: PLATFORM_KEYS.forProject(projectId),
    enabled,
    initialData,
    queryFn: () => apiClient<Platform[]>(`/projects/${projectId}/platforms`),
  });
}

/**
 * Сброс после правки платформ.
 *
 * Сбрасывается и роадмап: в его ответе живёт сводка релизов, и без этого
 * новая платформа не появилась бы в сводке до перезагрузки страницы.
 */
function usePlatformInvalidation(projectId: string) {
  const client = useQueryClient();

  return async () => {
    await client.invalidateQueries({ queryKey: PLATFORM_KEYS.forProject(projectId) });
    await client.invalidateQueries({ queryKey: ROADMAP_KEYS.forProject(projectId) });
  };
}

/** Заведение платформы. */
export function useMutationCreatePlatform(projectId: string) {
  const invalidate = usePlatformInvalidation(projectId);

  return useMutation({
    mutationFn: (input: PlatformCreate) =>
      apiClient<Platform>(`/projects/${projectId}/platforms`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

/** Правка имени платформы. */
export function useMutationUpdatePlatform(projectId: string) {
  const invalidate = usePlatformInvalidation(projectId);

  return useMutation({
    mutationFn: ({ platformId, input }: { platformId: string; input: PlatformUpdate }) =>
      apiClient<Platform>(`/projects/${projectId}/platforms/${platformId}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: invalidate,
  });
}

/** Удаление платформы вместе с её выпусками, тегами и связями. */
export function useMutationDeletePlatform(projectId: string) {
  const invalidate = usePlatformInvalidation(projectId);

  return useMutation({
    mutationFn: (platformId: string) =>
      apiClient(`/projects/${projectId}/platforms/${platformId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
