'use client';

import type { EnvironmentCreate, EnvironmentUpdate } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ENVIRONMENT_KEYS } from './useQueryEnvironments';

/** Создание окружения. Требуется уровень записи на секции. */
export function useMutationCreateEnvironment(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: EnvironmentCreate) =>
      apiClient(`/projects/${projectId}/environments`, { method: 'POST', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ENVIRONMENT_KEYS.forProject(projectId) });
    },
  });
}

/** Правка окружения. */
export function useMutationUpdateEnvironment(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EnvironmentUpdate }) =>
      apiClient(`/projects/${projectId}/environments/${id}`, { method: 'PATCH', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ENVIRONMENT_KEYS.forProject(projectId) });
    },
  });
}

/** Удаление окружения вместе с доменами. */
export function useMutationDeleteEnvironment(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/projects/${projectId}/environments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ENVIRONMENT_KEYS.forProject(projectId) });
    },
  });
}
