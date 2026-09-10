'use client';

import type { DomainDetail, DomainMap, DomainRow } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша доменов. */
export const DOMAIN_KEYS = {
  all: ['domains'] as const,
  byId: (id: string) => ['domains', id] as const,
  map: ['domains', 'map'] as const,
};

/** Реестр корневых доменов. Доступен только суперадмину. */
export function useQueryDomains({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: DOMAIN_KEYS.all,
    enabled,
    queryFn: () => apiClient<DomainRow[]>('/domains'),
  });
}

/** Корень вместе с поддоменами. */
export function useQueryDomain(id: string) {
  return useQuery({
    queryKey: DOMAIN_KEYS.byId(id),
    queryFn: () => apiClient<DomainDetail>(`/domains/${id}`),
  });
}

/** Данные карты доменов. */
export function useQueryDomainMap() {
  return useQuery({
    queryKey: DOMAIN_KEYS.map,
    queryFn: () => apiClient<DomainMap>('/domains/map'),
  });
}
