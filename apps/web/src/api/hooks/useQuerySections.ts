'use client';

import type { SectionLevels } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша уровней доступа. */
export const SECTION_KEYS = {
  forProject: (projectId: string) => ['sections', projectId] as const,
};

/** Уровни текущего субъекта по секциям проекта. */
export function useQuerySections(projectId: string) {
  return useQuery({
    queryKey: SECTION_KEYS.forProject(projectId),
    queryFn: () => apiClient<SectionLevels>(`/projects/${projectId}/sections`),
  });
}
