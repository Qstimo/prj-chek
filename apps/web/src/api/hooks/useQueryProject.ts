'use client';

import type { ProjectDetail, ProjectMetadata } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';
import { PROJECT_KEYS } from './useQueryProjects';

/** Карточка проекта. Состав полей зависит от уровня доступа (спека 5.5). */
export function useQueryProject(projectId: string) {
  return useQuery({
    queryKey: PROJECT_KEYS.detail(projectId),
    queryFn: () => apiClient<ProjectMetadata | ProjectDetail>(`/projects/${projectId}`),
  });
}
