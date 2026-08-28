'use client';

import type { AgentToken, AgentTokenCreate, AgentTokenCreated } from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша токенов агентов. */
export const AGENT_TOKEN_KEYS = {
  forProject: (projectId: string) => ['agent-tokens', projectId] as const,
};

/** Токены агентов проекта: без открытых значений. */
export function useQueryAgentTokens(projectId: string) {
  return useQuery({
    queryKey: AGENT_TOKEN_KEYS.forProject(projectId),
    queryFn: () => apiClient<AgentToken[]>(`/projects/${projectId}/agent-tokens`),
  });
}

/** Создание токена. Ответ содержит открытое значение — единственный раз. */
export function useMutationCreateAgentToken(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: AgentTokenCreate) =>
      apiClient<AgentTokenCreated>(`/projects/${projectId}/agent-tokens`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: AGENT_TOKEN_KEYS.forProject(projectId) });
    },
  });
}

/** Переключение доступа к значениям переменных. */
export function useMutationToggleAgentReveal(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ tokenId, value }: { tokenId: string; value: boolean }) =>
      apiClient(`/projects/${projectId}/agent-tokens/${tokenId}`, {
        method: 'PATCH',
        body: { canRevealVariables: value },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: AGENT_TOKEN_KEYS.forProject(projectId) });
    },
  });
}

/** Отзыв токена в один клик. */
export function useMutationRevokeAgentToken(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (tokenId: string) =>
      apiClient(`/projects/${projectId}/agent-tokens/${tokenId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: AGENT_TOKEN_KEYS.forProject(projectId) });
    },
  });
}
