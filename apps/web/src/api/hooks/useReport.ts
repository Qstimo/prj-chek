'use client';

import type { PublicLink, ReleaseReport } from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ApiError } from '../errors';

/** Ключи кэша отчётов по релизу. */
export const REPORT_KEYS = {
  forVersion: (projectId: string, versionId: string) =>
    ['release-report', projectId, versionId] as const,
  publicLink: (projectId: string, versionId: string) =>
    ['release-report-public-link', projectId, versionId] as const,
};

/** Путь ручек отчёта: один на запрос отчёта и на его публичную ссылку. */
function reportPath(projectId: string, versionId: string): string {
  return `/projects/${projectId}/roadmap/versions/${versionId}/report`;
}

/**
 * Отчёт по релизу версии.
 *
 * Отдельный запрос, а не выборка из кэша роадмапа: отчёт собирает сервер —
 * вместе с готовым текстом в двух видах, — и второй экземпляр правила
 * сборки на клиенте разошёлся бы с ним при первой же правке.
 */
export function useQueryReport(projectId: string, versionId: string) {
  return useQuery({
    queryKey: REPORT_KEYS.forVersion(projectId, versionId),
    queryFn: () => apiClient<ReleaseReport>(reportPath(projectId, versionId)),
  });
}

/**
 * Публичная ссылка на отчёт версии.
 *
 * Отсутствие публикации и нехватка прав — обычные состояния экрана,
 * а не ошибки загрузки, поэтому превращаются в `null`. Так же устроена
 * ссылка роадмапа.
 */
export function useQueryReportLink(projectId: string, versionId: string) {
  return useQuery({
    queryKey: REPORT_KEYS.publicLink(projectId, versionId),
    retry: false,
    queryFn: async (): Promise<PublicLink | null> => {
      try {
        return await apiClient<PublicLink>(`${reportPath(projectId, versionId)}/public-link`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return null;
        }

        throw cause;
      }
    },
  });
}

/** Публикация отчёта версии. Право суперадмина. */
export function useMutationPublishReport(projectId: string, versionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<PublicLink>(`${reportPath(projectId, versionId)}/public-link`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: REPORT_KEYS.publicLink(projectId, versionId) });
    },
  });
}

/** Отключение публикации отчёта: прежняя ссылка гаснет. */
export function useMutationUnpublishReport(projectId: string, versionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient(`${reportPath(projectId, versionId)}/public-link`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: REPORT_KEYS.publicLink(projectId, versionId) });
    },
  });
}
