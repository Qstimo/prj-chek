'use client';

import {
  INCIDENT_PAGE_LIMIT,
  INCIDENT_WINDOW_DAYS,
  type AddressIncidentHistory,
  type ProjectIncidents,
} from '@cairn/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ApiError } from '../errors';
import { STATUS_REFETCH_MS } from './useStatus';

/** Ключи кэша инцидентов. */
export const INCIDENT_KEYS = {
  forProject: (projectId: string) => ['incidents', projectId] as const,
  /**
   * История одного адреса: окно и предел входят в ключ.
   *
   * Иначе смена окна отдавала бы из кэша ответ за прежние тридцать дней,
   * а доля простоя считается именно за окно.
   */
  forAddress: (projectId: string, domainId: string, windowDays: number, limit: number) =>
    ['incidents', projectId, 'address', domainId, windowDays, limit] as const,
};

/** Параметры запроса истории одного адреса. */
export interface AddressIncidentsOptions {
  /** Окно в днях; умолчание — из контракта, а не зашитое здесь. */
  windowDays?: number;
  /** Сколько падений показывать; умолчание — из контракта. */
  limit?: number;
}

/**
 * Инциденты адресов проекта.
 *
 * Отсутствие доступа к инфраструктуре — обычное состояние экрана, а не
 * ошибка загрузки: превращается в пустой список, как и статус.
 *
 * Перепрашивается сам: статус считается на сервере по расписанию, и
 * открытая страница без автообновления показывала бы падение, которое
 * уже закрылось.
 */
export function useQueryIncidents(projectId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: INCIDENT_KEYS.forProject(projectId),
    retry: false,
    enabled: options.enabled ?? true,
    refetchInterval: STATUS_REFETCH_MS,
    queryFn: async (): Promise<ProjectIncidents> => {
      try {
        return await apiClient<ProjectIncidents>(`/projects/${projectId}/incidents`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return [];
        }

        throw cause;
      }
    },
  });
}

/**
 * Полная история падений одного адреса с долей времени «не отвечает».
 *
 * Своя ручка, а не фильтр выдачи по проекту: та отдаёт усечённый список
 * без доли простоя, и панель разбора тянула бы историю всех адресов.
 *
 * `null` вместо адреса означает «панель закрыта» — запрос не уходит
 * вовсе; `null` в данных — «секция не видна» (ручка отвечает 404 и на
 * чужой адрес, и при отсутствии выдачи).
 */
export function useQueryAddressIncidents(
  projectId: string,
  domainId: string | null,
  options: AddressIncidentsOptions = {},
) {
  const windowDays = options.windowDays ?? INCIDENT_WINDOW_DAYS;
  const limit = options.limit ?? INCIDENT_PAGE_LIMIT;

  return useInfiniteQuery({
    queryKey: INCIDENT_KEYS.forAddress(projectId, domainId ?? '', windowDays, limit),
    initialPageParam: 0,
    getNextPageParam: (page: AddressIncidentHistory | null) => page?.nextOffset ?? undefined,
    retry: false,
    enabled: domainId !== null,
    refetchInterval: STATUS_REFETCH_MS,
    queryFn: async ({ pageParam }): Promise<AddressIncidentHistory | null> => {
      try {
        return await apiClient<AddressIncidentHistory>(
          `/projects/${projectId}/addresses/${domainId}/incidents?windowDays=${windowDays}&limit=${limit}${pageParam ? `&offset=${pageParam}` : ''}`,
        );
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return null;
        }

        throw cause;
      }
    },
    // При обновлении infinite-query перечитывает раскрытые страницы по
    // порядку, заново вычисляя смещения: новое падение не сдвинет старые
    // страницы относительно первой. Сводка всегда берётся с первой.
    select: ({ pages }): AddressIncidentHistory | null => {
      const first = pages[0];

      if (!first) return null;

      const incidents = new Map(
        pages.flatMap((page) => page?.incidents ?? []).map((incident) => [incident.id, incident]),
      );

      return {
        ...first,
        incidents: [...incidents.values()],
        nextOffset: pages[pages.length - 1]?.nextOffset ?? null,
      };
    },
  });
}
