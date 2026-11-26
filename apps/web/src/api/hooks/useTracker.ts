'use client';

import type {
  ProjectTracker,
  TrackerBinding,
  TrackerBindingUpdate,
  TrackerConnection,
  TrackerConnectionUpdate,
  TrackerKind,
  TrackerProbeResult,
  TrackerTargets,
} from '@cairn/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';

/**
 * Ключи кэша трекера.
 *
 * Подключение, готовность у проекта и списки целей — три разные выдачи, и
 * ключи у них раздельные намеренно: подключение читает суперадмин на
 * `/settings`, готовность — подрядчик на каждом открытии роадмапа, а за
 * списками стоит живой запрос в трекер. Один ключ на все три перечитывал
 * бы чужой API на каждую правку настройки.
 */
export const TRACKER_KEYS = {
  connection: (kind: TrackerKind) => ['tracker', 'connection', kind] as const,
  forProject: (projectId: string) => ['tracker', 'project', projectId] as const,
  targets: (projectId: string) => ['tracker', 'targets', projectId] as const,
};

/**
 * Действующее подключение трекера. Токена в ответе нет никогда.
 *
 * Вид в адресе, а не в теле: он первичный ключ строки подключения
 * (контракт, `trackerConnectionUpdateSchema`), и тело, способное его
 * переписать, правило бы не ту настройку.
 */
export function useQueryTrackerConnection(kind: TrackerKind) {
  return useQuery({
    queryKey: TRACKER_KEYS.connection(kind),
    queryFn: () => apiClient<TrackerConnection>(`/tracker-connections/${kind}`),
  });
}

/** Задаёт подключение целиком: адрес, пространство, токен, выключатель. */
export function useMutationSaveTrackerConnection(kind: TrackerKind) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: TrackerConnectionUpdate) =>
      apiClient<TrackerConnection>(`/tracker-connections/${kind}`, { method: 'PUT', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: TRACKER_KEYS.connection(kind) });
      await client.invalidateQueries({ queryKey: ['tracker', 'project'] });
    },
  });
}

/**
 * Снимает подключение целиком.
 *
 * Не «вернуть настройку окружения», как у узлов модели: запасного источника
 * в окружении у трекера нет и не будет (дизайн, 3.4), и снятие строки
 * означает ровно «выгружать больше некуда».
 *
 * Сбрасывает и готовность у проектов: без подключения панели привязки нет
 * вовсе, и оставить прежний ответ в кэше значило бы показывать её после
 * снятия до перезагрузки страницы.
 */
export function useMutationClearTrackerConnection(kind: TrackerKind) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient(`/tracker-connections/${kind}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: TRACKER_KEYS.connection(kind) });
      await client.invalidateQueries({ queryKey: ['tracker', 'project'] });
    },
  });
}

/**
 * Проверяет связь живым вызовом: читает пространство трекера.
 *
 * Кэш не сбрасывает: проверка ничего не меняет, а её исход живёт в
 * состоянии экрана — он нужен человеку, пока он правит поле.
 */
export function useMutationProbeTracker(kind: TrackerKind) {
  return useMutation({
    mutationFn: () =>
      apiClient<TrackerProbeResult>(`/tracker-connections/${kind}/probe`, { method: 'POST' }),
  });
}

/**
 * Трекер со стороны проекта: можно ли выгружать и куда настроено.
 *
 * Дешёвая выдача — своя база, без обращения в трекер, — поэтому её можно
 * спрашивать на каждом открытии экрана. Адреса и состояния токена здесь
 * нет: это настройка установки, и подрядчику она не принадлежит
 * (контракт, `projectTrackerSchema`).
 */
export function useQueryProjectTracker(projectId: string, enabled = true) {
  return useQuery({
    queryKey: TRACKER_KEYS.forProject(projectId),
    enabled,
    queryFn: () => apiClient<ProjectTracker>(`/projects/${projectId}/tracker`),
  });
}

/**
 * Списки, из которых собирается привязка: проекты, доски, колонки трекера.
 *
 * Идут **через нашу ручку**, а не прямым запросом из браузера: токен не
 * покидает сервер (дизайн, 9.3).
 *
 * Загрузка включается при открытом выборе или показе сохранённой привязки,
 * чтобы на странице были видны названия доски и колонки.
 */
export function useQueryTrackerTargets(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: TRACKER_KEYS.targets(projectId),
    enabled,
    queryFn: () => apiClient<TrackerTargets>(`/projects/${projectId}/tracker/targets`),
    // Короткий кэш общий для панели и сводки, ограничивает запросы к Weeek.
    staleTime: 60_000,
  });
}

/** Ставит привязку проекта: куда выгружать его задачи. */
export function useMutationSaveTrackerBinding(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: TrackerBindingUpdate) =>
      apiClient<TrackerBinding>(`/projects/${projectId}/tracker/binding`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: TRACKER_KEYS.forProject(projectId) }),
  });
}
