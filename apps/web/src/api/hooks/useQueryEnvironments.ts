'use client';

import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша окружений. */
export const ENVIRONMENT_KEYS = {
  forProject: (projectId: string) => ['environments', projectId] as const,
};

/**
 * Окружения проекта в проекции, соответствующей уровню доступа.
 *
 * `enabled` нужен зависимому запросу: в форме адреса проект выбирается
 * на месте, и до выбора спрашивать нечего.
 */
export function useQueryEnvironments(projectId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ENVIRONMENT_KEYS.forProject(projectId),
    enabled,
    queryFn: () =>
      apiClient<(EnvironmentMetadata | EnvironmentDetail)[]>(
        `/projects/${projectId}/environments`,
      ),
  });
}
