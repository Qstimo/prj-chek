'use client';

import type { IntakeAddress } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { INTAKE_KEYS } from './useQueryIntakeAddress';

/** Создание приёмного адреса. Право суперадмина. */
export function useMutationCreateIntakeAddress(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<IntakeAddress>(`/projects/${projectId}/intake-address`, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: INTAKE_KEYS.forProject(projectId) });
    },
  });
}

/** Отзыв приёмного адреса: гасит все интеграции с прежним токеном. */
export function useMutationRevokeIntakeAddress(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient(`/projects/${projectId}/intake-address`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: INTAKE_KEYS.forProject(projectId) });
    },
  });
}
