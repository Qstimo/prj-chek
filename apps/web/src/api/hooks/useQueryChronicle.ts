'use client';

import type { ChronicleDetail, ChronicleMetadata } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша хроники. */
export const CHRONICLE_KEYS = {
  forProject: (projectId: string) => ['chronicle', projectId] as const,
};

/** Лента проекта в проекции, соответствующей уровню доступа. */
export function useQueryChronicle(projectId: string) {
  return useQuery({
    queryKey: CHRONICLE_KEYS.forProject(projectId),
    queryFn: () =>
      apiClient<(ChronicleMetadata | ChronicleDetail)[]>(`/projects/${projectId}/chronicle`),
  });
}
