'use client';

import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша окружений. */
export const ENVIRONMENT_KEYS = {
  forProject: (projectId: string) => ['environments', projectId] as const,
};

/** Окружения проекта в проекции, соответствующей уровню доступа. */
export function useQueryEnvironments(projectId: string) {
  return useQuery({
    queryKey: ENVIRONMENT_KEYS.forProject(projectId),
    queryFn: () =>
      apiClient<(EnvironmentMetadata | EnvironmentDetail)[]>(
        `/projects/${projectId}/environments`,
      ),
  });
}
