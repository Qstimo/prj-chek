'use client';

import {
  taskExportResultSchema,
  type ProjectTask,
  type ProjectTaskCreate,
  type ProjectTaskUpdate,
  type TaskExportResult,
} from '@cairn/shared';
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

/**
 * Тело ответа выгрузки не по контракту.
 *
 * Фраза, а не молчание: разобрать итог нечем, но задачи при этом могли
 * уехать — отказ, относящийся ко всему набору, приходит кодом HTTP и только
 * до первого байта наружу (контракт, `taskExportResultSchema`). Поэтому
 * текст отправляет туда, где правда ещё видна, — в колонку зеркала.
 */
const EXPORT_RESULT_UNREADABLE =
  'Выгрузка ушла, но её итог не разобран: ответ сервера не по контракту. ' +
  'Что уехало, видно в колонке «Выгрузка» — список уже перечитан.';

/**
 * Выгружает набор задач во внешний трекер и отдаёт итог по каждой задаче.
 *
 * Одна ручка на одну и на много задач: набор из одного элемента и есть одна
 * задача (план, C2). Вторая мутация «выгрузить одну» повторяла бы порядок,
 * в котором запись в журнал обязана идти до первого байта, а повторённый
 * порядок расходится.
 *
 * В теле только идентификаторы задач: формулировки, доска и колонка телом
 * не ходят. Доску задаёт привязка проекта — иначе задача уехала бы на чужую
 * доску мимо настройки, — а формулировку сервер берёт из реестра, потому
 * что наружу уходит его содержимое, и присланная строка уехала бы в трекер,
 * не совпав ни с одной задачей в журнале.
 *
 * Прежнее «ответ не читается намеренно: схемы ответа в контракте нет»
 * **неверно**: схема есть (`taskExportResultSchema`), и итог у набора лежит
 * ровно в теле — сервер отвечает `201` и когда обмен не удался. Выброшенное
 * тело стоило человеку всего: при первом неудачном обмене строки зеркала не
 * возникает вовсе, перечитанный реестр о неудаче молчит, и задача оставалась
 * «Не выгружена» без единого слова о том, почему.
 *
 * Разбор — схемой контракта, а не доверием к форме: исход, которого в
 * перечне нет, не посчитался бы ни одним из четырёх, и набор из трёх задач
 * показал бы «заведено 0, не вышло 0» ровно там, где человек решает,
 * повторять ли выгрузку.
 *
 * Перечитывание стоит на `onSettled`, а не на `onSuccess`: нечитаемое тело —
 * это неудача мутации при уехавших задачах, и оставить реестр нетронутым
 * значило бы показывать вид до выгрузки. Лишний `GET` на отказе до первого
 * байта (`409`, `404`) этого не стоит: он дешёв, а расхождение экрана с
 * трекером — нет.
 */
export function useMutationExportTasks(projectId: string) {
  const invalidate = useTaskInvalidation(projectId);

  return useMutation({
    mutationFn: async (taskIds: string[]): Promise<TaskExportResult[]> => {
      const payload = await apiClient<unknown>(`/projects/${projectId}/tasks/export`, {
        method: 'POST',
        body: { taskIds },
      });
      // `.array()` схемы, а не `z.array(...)`: у веба свой экземпляр zod в
      // зависимостях, и собранная им обёртка над чужой схемой — второй
      // экземпляр правил там, где нужен один.
      const parsed = taskExportResultSchema.array().safeParse(payload);

      if (!parsed.success) {
        throw new Error(EXPORT_RESULT_UNREADABLE);
      }

      return parsed.data;
    },
    onSettled: invalidate,
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
