'use client';

import type { EnvironmentCreate, EnvironmentUpdate } from '@cairn/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { DOMAIN_KEYS } from './useQueryDomains';
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

/**
 * Заводит один адрес окружения.
 *
 * Проект в аргументах мутации, а не в аргументах хука: адрес заводится
 * и из реестра доменов, где в одном списке соседствуют окружения разных
 * проектов.
 */
export function useMutationAddEnvironmentDomain() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      environmentId,
      name,
    }: {
      projectId: string;
      environmentId: string;
      name: string;
    }) =>
      apiClient(`/projects/${projectId}/environments/${environmentId}/domains`, {
        method: 'POST',
        body: { name },
      }),
    onSuccess: (_data, { projectId }) => invalidateAddressViews(client, projectId),
  });
}

/** Снимает адрес с окружения. Корень остаётся в реестре. */
export function useMutationRemoveEnvironmentDomain() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      environmentId,
      domainId,
    }: {
      projectId: string;
      environmentId: string;
      domainId: string;
    }) =>
      apiClient(`/projects/${projectId}/environments/${environmentId}/domains/${domainId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, { projectId }) => invalidateAddressViews(client, projectId),
  });
}

/**
 * Сбрасывает всё, на что влияет правка адреса.
 *
 * Реестр доменов — не лишнее: адрес мог завести новый корень, а снятие
 * меняет счётчики и дерево.
 */
async function invalidateAddressViews(client: QueryClient, projectId: string): Promise<void> {
  await client.invalidateQueries({ queryKey: ENVIRONMENT_KEYS.forProject(projectId) });
  await client.invalidateQueries({ queryKey: DOMAIN_KEYS.all });
  await client.invalidateQueries({ queryKey: ['status'] });
}
