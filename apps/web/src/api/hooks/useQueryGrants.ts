'use client';

import type { GrantMatrixRow } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша выдач. */
export const GRANT_KEYS = {
  forProject: (projectId: string) => ['grants', projectId] as const,
};

/** Матрица доступов по проекту. */
export function useQueryGrants(projectId: string) {
  return useQuery({
    queryKey: GRANT_KEYS.forProject(projectId),
    queryFn: () => apiClient<GrantMatrixRow[]>(`/projects/${projectId}/grants`),
  });
}
