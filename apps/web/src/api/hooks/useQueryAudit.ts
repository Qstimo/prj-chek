'use client';

import type { AuditPage } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Фильтры журнала, задаваемые интерфейсом. */
export interface AuditFilters {
  subjectId?: string;
  projectId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

/** Страница журнала. */
export function useQueryAudit(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => apiClient<AuditPage>(`/audit?${buildQuery(filters)}`),
  });
}

/** Собирает строку запроса, пропуская пустые фильтры. */
function buildQuery(filters: AuditFilters): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }

  return params.toString();
}
