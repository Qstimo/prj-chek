'use client';

import type { ProjectTask, ProjectTaskCreate, ProjectTaskUpdate } from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ROADMAP_KEYS } from './useQueryRoadmap';

/** Ключи кэша реестра задач. */
export const TASK_KEYS = {
  forProject: (projectId: string) => ['tasks', projectId] as const,
};

/**
 * Задачи проекта вместе с размещением.
 *
 * Фильтр «только вне версий» в ключ кэша **не входит**: список целиком
 * приходит одним запросом и фильтруется на экране — задач у проекта
 * десятки, и второй запрос за подмножеством уже имеющегося означал бы
 * мигание списка на переключении фильтра.
 */
export function useQueryTasks(projectId: string, enabled = true) {
  return useQuery({
    queryKey: TASK_KEYS.forProject(projectId),
    enabled,
    queryFn: () => apiClient<ProjectTask[]>(`/projects/${projectId}/tasks`),
  });
}

/**
 * Инвалидация после правки задачи.
 *
 * Роадмап инвалидируется **вместе** с реестром, и это не перестраховка:
 * формулировка, показанная в версии, живёт у задачи, а признак «закрыт» —
 * у размещения. Правка любой из двух сторон меняет оба экрана.
 */
function useTaskInvalidation(projectId: string) {
  const client = useQueryClient();

  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: TASK_KEYS.forProject(projectId) }),
      client.invalidateQueries({ queryKey: ROADMAP_KEYS.forProject(projectId) }),
    ]);
  };
}

/** Заводит задачу вне версий. */
export function useMutationCreateTask(projectId: string) {
  const invalidate = useTaskInvalidation(projectId);

  return useMutation({
    mutationFn: (input: ProjectTaskCreate) =>
      apiClient<ProjectTask>(`/projects/${projectId}/tasks`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

/** Правит формулировку, ссылку и теги задачи. */
export function useMutationUpdateTask(projectId: string) {
  const invalidate = useTaskInvalidation(projectId);

  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: ProjectTaskUpdate }) =>
      apiClient<ProjectTask>(`/projects/${projectId}/tasks/${taskId}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Удаляет задачу из реестра.
 *
 * Размещённую сервер не отдаёт удалить (`409` с кодом `task_placed`), и
 * экран обязан показать именно эту причину: «сначала выньте из версии» —
 * действие, а не отказ без выхода.
 */
export function useMutationDeleteTask(projectId: string) {
  const invalidate = useTaskInvalidation(projectId);

  return useMutation({
    mutationFn: (taskId: string) =>
      apiClient(`/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/** Вынимает задачу из версии, оставляя её в реестре. */
export function useMutationDetachTask(projectId: string) {
  const invalidate = useTaskInvalidation(projectId);

  return useMutation({
    mutationFn: (taskId: string) =>
      apiClient<ProjectTask>(`/projects/${projectId}/tasks/${taskId}/detach`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}
