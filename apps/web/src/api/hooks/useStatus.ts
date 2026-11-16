'use client';

import type { ProjectStatus } from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { apiClient } from '../client';
import { ApiError } from '../errors';

/** Ключи кэша статусов. */
export const STATUS_KEYS = {
  forProject: (projectId: string) => ['status', projectId] as const,
};

/**
 * Как часто перепрашивать статус и инциденты, в миллисекундах.
 *
 * Статус считается на сервере по расписанию (пятнадцать минут по
 * умолчанию) и руками не задаётся, поэтому открытая страница без
 * автообновления показывает прошлое: падение, которое уже закрылось, или
 * зелёный адрес, который лежит десять минут. Минута — заметно чаще
 * прогона, но не нагрузка: ответ собирается из уже посчитанных строк.
 */
export const STATUS_REFETCH_MS = 60_000;
export const STATUS_RUNNING_REFETCH_MS = 1_500;

/**
 * Статус проекта. Отсутствие доступа к инфраструктуре — обычное
 * состояние экрана, а не ошибка загрузки: превращается в `null`.
 */
export function useQueryProjectStatus(projectId: string) {
  const client = useQueryClient();
  const wasRunning = useRef(false);
  const query = useQuery({
    queryKey: STATUS_KEYS.forProject(projectId),
    retry: false,
    refetchInterval: (query) => query.state.data?.checkRunning ? STATUS_RUNNING_REFETCH_MS : STATUS_REFETCH_MS,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<ProjectStatus | null> => {
      try {
        return await apiClient<ProjectStatus>(`/projects/${projectId}/status`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return null;
        }

        throw cause;
      }
    },
  });
  useEffect(() => {
    if (!query.data) return;
    const completed = wasRunning.current && query.data.checkRunning === false;
    // Reset before invalidation: the forced false->false response must not
    // trigger another refresh. Idle reads retain normal eventual consistency.
    wasRunning.current = Boolean(query.data.checkRunning);
    if (completed) {
      // A whole run can fit between the API's lock samples. Read once more
      // after observed completion rather than treating its old aggregate as final.
      void client.invalidateQueries({ queryKey: STATUS_KEYS.forProject(projectId) });
      void client.invalidateQueries({ queryKey: ['incidents', projectId] });
    }
  }, [query.data, client, projectId]);
  return query;
}

/** Ручной запуск всех проверок. Право суперадмина. */
export function useMutationRunChecks() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient('/status/run', { method: 'POST' }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['status'] });
      // Keep waiting after 202 (or a lost response) until a status GET confirms completion.
      client.setQueriesData<ProjectStatus | null>({ queryKey: ['status'] }, (data) =>
        data ? { ...data, checkRunning: true } : data,
      );
    },
    onSuccess: async () => {
      // Прогон меняет и статусы, и инциденты: без второго сброса
      // индикатор краснел, а «не отвечает с 14:20» у адреса оставалось
      // от состояния до проверки.
      await Promise.all([
        client.invalidateQueries({ queryKey: ['status'] }),
        client.invalidateQueries({ queryKey: ['incidents'] }),
      ]);
    },
    onSettled: () => { void client.invalidateQueries({ queryKey: ['status'] }); },
  });
}
