'use client';

import type { ServerDetail, ServerMap, ServerRow } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша серверов. */
export const SERVER_KEYS = {
  all: ['servers'] as const,
  byId: (id: string) => ['servers', id] as const,
  map: ['servers', 'map'] as const,
};

/**
 * Реестр серверов. Доступен только суперадмину.
 *
 * `enabled` нужен экранам проекта: там хук вызывается всегда, но запрос
 * имеет смысл лишь для суперадмина — остальным API ответит отказом.
 */
export function useQueryServers({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SERVER_KEYS.all,
    enabled,
    queryFn: () => apiClient<ServerRow[]>('/servers'),
  });
}

/** Сервер вместе с размещёнными на нём окружениями. */
export function useQueryServer(id: string) {
  return useQuery({
    queryKey: SERVER_KEYS.byId(id),
    queryFn: () => apiClient<ServerDetail>(`/servers/${id}`),
  });
}

/** Данные карты размещения. */
export function useQueryServerMap() {
  return useQuery({
    queryKey: SERVER_KEYS.map,
    queryFn: () => apiClient<ServerMap>('/servers/map'),
  });
}
