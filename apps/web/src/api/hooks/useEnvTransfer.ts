'use client';

import type { ImportResult } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { VARIABLE_KEYS } from './useQueryVariables';

/** Импорт `.env`: upsert без удаления. */
export function useMutationImportEnv(projectId: string, environmentId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      apiClient<ImportResult>(
        `/projects/${projectId}/environments/${environmentId}/variables/import`,
        { method: 'POST', body: { content } },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: VARIABLE_KEYS.forEnvironment(projectId, environmentId),
      });
    },
  });
}

/**
 * Выгрузка `.env`.
 *
 * Мутация: массовое раскрытие фиксируется в журнале, и повторять его
 * фоново или из кэша недопустимо.
 */
export function useMutationExportEnv(projectId: string, environmentId: string) {
  return useMutation({
    mutationFn: () =>
      apiClient<string>(
        `/projects/${projectId}/environments/${environmentId}/variables/export`,
        { parse: 'text' },
      ),
  });
}
