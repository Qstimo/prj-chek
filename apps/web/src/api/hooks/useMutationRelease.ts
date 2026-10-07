'use client';

import type { PlatformRelease, PlatformReleaseSet } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ROADMAP_KEYS } from './useQueryRoadmap';

/** Сброс роадмапа: в его ответе живут и выпуски версии, и сводка. */
function useReleaseInvalidation(projectId: string) {
  const client = useQueryClient();

  return async () => {
    await client.invalidateQueries({ queryKey: ROADMAP_KEYS.forProject(projectId) });
  };
}

/**
 * Постановка выпуска платформы в версии.
 *
 * `PUT`: выпуск — не отдельная вещь со своим адресом, а значение в клетке
 * «версия × платформа», и не присланные поля обнуляются.
 */
export function useMutationSetRelease(projectId: string) {
  const invalidate = useReleaseInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      versionId,
      platformId,
      input,
    }: {
      versionId: string;
      platformId: string;
      input: PlatformReleaseSet;
    }) =>
      apiClient<PlatformRelease>(
        `/projects/${projectId}/roadmap/versions/${versionId}/releases/${platformId}`,
        { method: 'PUT', body: input },
      ),
    onSuccess: invalidate,
  });
}

/** Снятие выпуска: платформа снова идёт «как у версии». */
export function useMutationClearRelease(projectId: string) {
  const invalidate = useReleaseInvalidation(projectId);

  return useMutation({
    mutationFn: ({ versionId, platformId }: { versionId: string; platformId: string }) =>
      apiClient(`/projects/${projectId}/roadmap/versions/${versionId}/releases/${platformId}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  });
}
