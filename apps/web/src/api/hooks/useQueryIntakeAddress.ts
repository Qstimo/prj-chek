'use client';

import type { IntakeAddress } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ApiError } from '../errors';

/** Ключи кэша приёмного адреса. */
export const INTAKE_KEYS = {
  forProject: (projectId: string) => ['intake-address', projectId] as const,
};

/**
 * Приёмный адрес проекта.
 *
 * Отсутствие адреса и нехватка прав — обычные состояния экрана,
 * а не ошибки загрузки, поэтому превращаются в `null`.
 */
export function useQueryIntakeAddress(projectId: string) {
  return useQuery({
    queryKey: INTAKE_KEYS.forProject(projectId),
    retry: false,
    queryFn: async (): Promise<IntakeAddress | null> => {
      try {
        return await apiClient<IntakeAddress>(`/projects/${projectId}/intake-address`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return null;
        }

        throw cause;
      }
    },
  });
}
