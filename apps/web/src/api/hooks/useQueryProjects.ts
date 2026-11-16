'use client';

import type { ProjectListItem } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша проектов. Собраны в одном месте, чтобы не разъезжались. */
export const PROJECT_KEYS = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
};

/** Список видимых проектов (строки сводки). */
export function useQueryProjects(initialData?: ProjectListItem[]) {
  return useQuery({
    queryKey: PROJECT_KEYS.all,
    queryFn: () => apiClient<ProjectListItem[]>('/projects'),
    initialData,
    refetchOnMount: 'always',
  });
}
