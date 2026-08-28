'use client';

import type { RoadmapResponse } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша роадмапа. */
export const ROADMAP_KEYS = {
  forProject: (projectId: string) => ['roadmap', projectId] as const,
  publicLink: (projectId: string) => ['roadmap-public-link', projectId] as const,
};

/** Роадмап проекта в проекции по уровню доступа. */
export function useQueryRoadmap(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ROADMAP_KEYS.forProject(projectId),
    enabled,
    queryFn: () => apiClient<RoadmapResponse>(`/projects/${projectId}/roadmap`),
  });
}
