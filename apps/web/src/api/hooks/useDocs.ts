'use client';

import type {
  DocPageCreate,
  DocPageDetail,
  DocPageMetadata,
  DocPageUpdate,
} from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша документации. */
export const DOC_KEYS = {
  forProject: (projectId: string) => ['docs', projectId] as const,
  page: (projectId: string, pageId: string) => ['doc-page', projectId, pageId] as const,
};

/** Список страниц проекта в проекции по уровню. */
export function useQueryDocs(projectId: string) {
  return useQuery({
    queryKey: DOC_KEYS.forProject(projectId),
    queryFn: () =>
      apiClient<(DocPageMetadata | DocPageDetail)[]>(`/projects/${projectId}/docs`),
  });
}

/** Одна страница; грузится только когда выбрана. */
export function useQueryDocPage(projectId: string, pageId: string | null) {
  return useQuery({
    queryKey: DOC_KEYS.page(projectId, pageId ?? 'нет'),
    enabled: pageId !== null,
    queryFn: () =>
      apiClient<DocPageMetadata | DocPageDetail>(`/projects/${projectId}/docs/${pageId}`),
  });
}

/** Создание страницы. */
export function useMutationCreateDocPage(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: DocPageCreate) =>
      apiClient(`/projects/${projectId}/docs`, { method: 'POST', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: DOC_KEYS.forProject(projectId) });
    },
  });
}

/** Правка страницы. */
export function useMutationUpdateDocPage(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DocPageUpdate }) =>
      apiClient(`/projects/${projectId}/docs/${id}`, { method: 'PATCH', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: DOC_KEYS.forProject(projectId) });
      await client.invalidateQueries({ queryKey: ['doc-page', projectId] });
    },
  });
}

/** Удаление страницы. */
export function useMutationDeleteDocPage(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/projects/${projectId}/docs/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: DOC_KEYS.forProject(projectId) });
    },
  });
}
