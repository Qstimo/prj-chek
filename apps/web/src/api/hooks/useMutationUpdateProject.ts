'use client';

import type { ProjectDetail, ProjectUpdate } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { PROJECT_KEYS } from './useQueryProjects';

/** Правка полей паспорта проекта. */
export function useMutationUpdateProject(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ProjectUpdate) =>
      apiClient<ProjectDetail>(`/projects/${projectId}`, { method: 'PATCH', body: input }),
    onSuccess: async () => {
      // Обновляем и карточку, и список: название видно в обоих местах.
      await client.invalidateQueries({ queryKey: PROJECT_KEYS.detail(projectId) });
      await client.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    },
  });
}
