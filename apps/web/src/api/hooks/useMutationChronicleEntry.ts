'use client';

import type { ChronicleEntryCreate, ChronicleEntryUpdate } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { CHRONICLE_KEYS } from './useQueryChronicle';

/** Создание записи хроники. Требуется уровень записи на секции. */
export function useMutationCreateChronicleEntry(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ChronicleEntryCreate) =>
      apiClient(`/projects/${projectId}/chronicle`, { method: 'POST', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CHRONICLE_KEYS.forProject(projectId) });
    },
  });
}

/** Правка записи хроники. */
export function useMutationUpdateChronicleEntry(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChronicleEntryUpdate }) =>
      apiClient(`/projects/${projectId}/chronicle/${id}`, { method: 'PATCH', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CHRONICLE_KEYS.forProject(projectId) });
    },
  });
}

/** Удаление записи хроники. */
export function useMutationDeleteChronicleEntry(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/projects/${projectId}/chronicle/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CHRONICLE_KEYS.forProject(projectId) });
    },
  });
}
