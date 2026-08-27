'use client';

import type { ProjectMetadata } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша проектов. Собраны в одном месте, чтобы не разъезжались. */
export const PROJECT_KEYS = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
};

/** Список видимых проектов. */
export function useQueryProjects() {
  return useQuery({
    queryKey: PROJECT_KEYS.all,
    queryFn: () => apiClient<ProjectMetadata[]>('/projects'),
  });
}
