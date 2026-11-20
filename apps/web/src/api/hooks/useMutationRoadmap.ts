'use client';

import type {
  CheckpointCarryOver,
  CheckpointCarryOverResult,
  LinkTitleResponse,
  ProjectTaskUpdate,
  RoadmapCheckpointCreate,
  RoadmapCheckpointUpdate,
  RoadmapVersionCreate,
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

/**
 * Правка задачи, стоящей в версии: формулировка, ссылка, теги.
 *
 * Ручка **задачи**, а не чекпоинта: формулировка живёт у задачи, и у поля
 * одно место записи. Инвалидация роадмапа при этом та же — на экране
 * версии показана именно эта формулировка.
 */
export function useMutationUpdatePlacedTask(projectId: string) {
  const invalidate = useRoadmapInvalidation(projectId);

  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: ProjectTaskUpdate }) =>
      apiClient(`/projects/${projectId}/tasks/${taskId}`, { method: 'PUT', body: input }),
    onSuccess: invalidate,
  });
}

/** Правка размещения: признак «закрыт» и позиция. */
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
 * Перенос чекпоинта в другую версию.
 *
 * Отдельная мутация, а не правка чекпоинта: «найти или создать целевую
 * версию» делается на сервере одним действием, и журнал пишет свой вид
 * записи. Пустое тело означает «следующая открытая версия» — правило
 * живёт на сервере, и второй его экземпляр в браузере с ним разошёлся бы.
 *
 * Отказ 409 с кодом `carry_over_needs_label` доезжает до вызывающего как
 * обычная `ApiError` с телом в `details`: панель читает код и спрашивает
 * обозначение новой версии.
 */
export function useMutationCarryOverCheckpoint(projectId: string) {
  const invalidate = useRoadmapInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      versionId,
      checkpointId,
      input,
    }: {
      versionId: string;
      checkpointId: string;
      input?: CheckpointCarryOver;
    }) =>
      apiClient<CheckpointCarryOverResult>(
        `/projects/${projectId}/roadmap/versions/${versionId}/checkpoints/${checkpointId}/carry-over`,
        { method: 'POST', body: input ?? {} },
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
