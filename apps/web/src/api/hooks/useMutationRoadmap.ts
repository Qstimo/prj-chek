'use client';

import type {
  LinkTitleResponse,
  RoadmapCheckpointCreate,
  RoadmapCheckpointUpdate,
  RoadmapVersionCreate,
  RoadmapVersionUpdate,
} from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ROADMAP_KEYS } from './useQueryRoadmap';

/** Хук инвалидации роадмапа после мутации. */
function useRoadmapInvalidation(projectId: string) {
  const client = useQueryClient();

  return async () => {
    await client.invalidateQueries({ queryKey: ROADMAP_KEYS.forProject(projectId) });
  };
}

/** Создание версии. */
export function useMutationCreateVersion(projectId: string) {
  const invalidate = useRoadmapInvalidation(projectId);

  return useMutation({
    mutationFn: (input: RoadmapVersionCreate) =>
      apiClient(`/projects/${projectId}/roadmap/versions`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

/** Правка версии. */
export function useMutationUpdateVersion(projectId: string) {
  const invalidate = useRoadmapInvalidation(projectId);

  return useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: RoadmapVersionUpdate }) =>
      apiClient(`/projects/${projectId}/roadmap/versions/${versionId}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: invalidate,
  });
}

/** Удаление версии вместе с чекпоинтами. */
export function useMutationDeleteVersion(projectId: string) {
  const invalidate = useRoadmapInvalidation(projectId);

  return useMutation({
    mutationFn: (versionId: string) =>
      apiClient(`/projects/${projectId}/roadmap/versions/${versionId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/** Создание чекпоинта. */
export function useMutationCreateCheckpoint(projectId: string) {
  const invalidate = useRoadmapInvalidation(projectId);

  return useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: RoadmapCheckpointCreate }) =>
      apiClient(`/projects/${projectId}/roadmap/versions/${versionId}/checkpoints`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: invalidate,
  });
}

/** Правка чекпоинта: формулировка, признак «закрыт», позиция. */
export function useMutationUpdateCheckpoint(projectId: string) {
  const invalidate = useRoadmapInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      versionId,
      checkpointId,
      input,
    }: {
      versionId: string;
      checkpointId: string;
      input: RoadmapCheckpointUpdate;
    }) =>
      apiClient(
        `/projects/${projectId}/roadmap/versions/${versionId}/checkpoints/${checkpointId}`,
        { method: 'PATCH', body: input },
      ),
    onSuccess: invalidate,
  });
}

/** Удаление чекпоинта. */
export function useMutationDeleteCheckpoint(projectId: string) {
  const invalidate = useRoadmapInvalidation(projectId);

  return useMutation({
    mutationFn: ({ versionId, checkpointId }: { versionId: string; checkpointId: string }) =>
      apiClient(
        `/projects/${projectId}/roadmap/versions/${versionId}/checkpoints/${checkpointId}`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidate,
  });
}

/**
 * Заголовок страницы по ссылке на задачу.
 *
 * Мутация, а не запрос: наружу ходит сервер по явной просьбе человека, и
 * кэшировать этот поход незачем. Адрес начинается с проекта намеренно —
 * право то же, что у самого чекпоинта, отдельного не заводится.
 */
export function useMutationReadLinkTitle(projectId: string) {
  return useMutation({
    mutationFn: async (url: string) => {
      const { title } = await apiClient<LinkTitleResponse>(
        `/projects/${projectId}/roadmap/link-title`,
        { method: 'POST', body: { url } },
      );

      return title;
    },
  });
}
