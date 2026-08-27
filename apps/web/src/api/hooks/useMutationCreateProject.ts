'use client';

import type { ProjectCreate, ProjectDetail } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { PROJECT_KEYS } from './useQueryProjects';

/** Создание проекта. Доступно только суперадмину (спека 4.4). */
export function useMutationCreateProject() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ProjectCreate) =>
      apiClient<ProjectDetail>('/projects', { method: 'POST', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    },
  });
}
