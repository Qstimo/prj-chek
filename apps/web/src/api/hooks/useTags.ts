'use client';

import type { Tag } from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { PROJECT_KEYS } from './useQueryProjects';

/** Ключи кэша тегов. */
export const TAG_KEYS = {
  vocabulary: ['tags'] as const,
};

/**
 * Словарь тегов: чем помечают в видимых субъекту паспортах.
 *
 * Нужен подсказкам в форме проекта. Без общего словаря свободные теги
 * расходятся — рядом с «Web» появляется «Вэб», — и фильтр начинает делить
 * сводку вместо того, чтобы её собирать.
 */
export function useQueryTagVocabulary({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: TAG_KEYS.vocabulary,
    enabled,
    queryFn: () => apiClient<Tag[]>('/tags'),
  });
}

/**
 * Правка набора тегов проекта: набор уходит целиком.
 *
 * Сбрасывается и сводка: теги видны в её строках и собирают её фильтр,
 * и без этого снятый тег остался бы кнопкой фильтра до перезагрузки.
 */
export function useMutationSetProjectTags(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (labels: string[]) =>
      apiClient<Tag[]>(`/projects/${projectId}/tags`, { method: 'PUT', body: { labels } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: PROJECT_KEYS.detail(projectId) });
      await client.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      await client.invalidateQueries({ queryKey: TAG_KEYS.vocabulary });
    },
  });
}
