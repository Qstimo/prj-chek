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

/** Реестр серверов. Доступен только суперадмину. */
export function useQueryServers() {
  return useQuery({
    queryKey: SERVER_KEYS.all,
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
