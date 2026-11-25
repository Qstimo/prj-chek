'use client';

import {
  trackerImportPreviewSchema,
  trackerImportResultSchema,
  type TrackerImportQuery,
  type TrackerImportRequest,
} from '@cairn/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { TASK_KEYS } from './useTasks';

export function useQueryImportTasks(projectId: string, filter: TrackerImportQuery | undefined) {
  return useQuery({
    queryKey: ['task-import', projectId, filter],
    enabled: filter !== undefined,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams(
        Object.entries(filter!).filter(([, value]) => value !== undefined) as [string, string][],
      );
      return trackerImportPreviewSchema.parse(
        await apiClient<unknown>(`/projects/${projectId}/tasks/import?${query}`, { signal }),
      );
    },
  });
}

export function useMutationImportTasks(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: TrackerImportRequest) =>
      trackerImportResultSchema.array().parse(
        await apiClient<unknown>(`/projects/${projectId}/tasks/import`, {
          method: 'POST',
          body: input,
        }),
      ),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: TASK_KEYS.forProject(projectId) }),
        client.invalidateQueries({ queryKey: ['task-import', projectId] }),
      ]),
  });
}
