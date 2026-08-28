'use client';

import type { RevealResponse, VariableCreate, VariableUpdate } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { VARIABLE_KEYS } from './useQueryVariables';

/** Адрес переменных окружения. */
function baseUrl(projectId: string, environmentId: string): string {
  return `/projects/${projectId}/environments/${environmentId}/variables`;
}

/** Создание переменной с первой версией значения. */
export function useMutationCreateVariable(projectId: string, environmentId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: VariableCreate) =>
      apiClient(baseUrl(projectId, environmentId), { method: 'POST', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: VARIABLE_KEYS.forEnvironment(projectId, environmentId),
      });
    },
  });
}

/** Правка. Поле `value` создаёт новую версию. */
export function useMutationUpdateVariable(projectId: string, environmentId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VariableUpdate }) =>
      apiClient(`${baseUrl(projectId, environmentId)}/${id}`, { method: 'PATCH', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['variables', projectId] });
    },
  });
}

/** Удаление переменной вместе с версиями. */
export function useMutationDeleteVariable(projectId: string, environmentId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`${baseUrl(projectId, environmentId)}/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: VARIABLE_KEYS.forEnvironment(projectId, environmentId),
      });
    },
  });
}

/**
 * Раскрытие значения.
 *
 * Мутация, а не запрос: каждое раскрытие фиксируется в журнале,
 * и кэшировать его или повторять фоново недопустимо.
 */
export function useMutationRevealVariable(projectId: string, environmentId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<RevealResponse>(`${baseUrl(projectId, environmentId)}/${id}/reveal`, {
        method: 'POST',
      }),
  });
}

/** Раскрытие исторической версии. */
export function useMutationRevealVersion(projectId: string, environmentId: string) {
  return useMutation({
    mutationFn: ({ id, versionNo }: { id: string; versionNo: number }) =>
      apiClient<RevealResponse>(
        `${baseUrl(projectId, environmentId)}/${id}/versions/${versionNo}/reveal`,
        { method: 'POST' },
      ),
  });
}

/** Откат к версии: создаёт новую версию поверх. */
export function useMutationRollbackVariable(projectId: string, environmentId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, toVersion }: { id: string; toVersion: number }) =>
      apiClient(`${baseUrl(projectId, environmentId)}/${id}/rollback`, {
        method: 'POST',
        body: { toVersion },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: VARIABLE_KEYS.forEnvironment(projectId, environmentId),
      });
      await client.invalidateQueries({ queryKey: ['variable-versions', projectId] });
    },
  });
}
