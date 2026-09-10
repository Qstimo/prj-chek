'use client';

import type { ServerCreate, ServerUpdate } from '@cairn/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { SERVER_KEYS } from './useQueryServers';

/**
 * Заводит сервер.
 *
 * Тип ответа не объявляется: API отдаёт сырую строку таблицы без
 * индикатора и счётчиков, и обещать здесь `ServerRow` значило бы соврать
 * первому же, кто прочитает `data.indicator`. Результат нужен только
 * для инвалидации.
 */
export function useMutationCreateServer() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ServerCreate) =>
      apiClient('/servers', { method: 'POST', body: input }),
    onSuccess: () => invalidateServerViews(client),
  });
}

/** Правит сервер. */
export function useMutationUpdateServer() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServerUpdate }) =>
      apiClient(`/servers/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => invalidateServerViews(client),
  });
}

/** Удаляет сервер. Занятый сервер удалить нельзя. */
export function useMutationDeleteServer() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient(`/servers/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateServerViews(client),
  });
}

/**
 * Сбрасывает всё, на что влияет правка сервера.
 *
 * Статусы проектов — не лишнее: срок оплаты машины поднимает индикатор
 * каждого проекта на ней, и оставить их в кэше значило бы показывать
 * вчерашнюю картину.
 */
async function invalidateServerViews(client: QueryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: SERVER_KEYS.all });
  await client.invalidateQueries({ queryKey: ['status'] });
  await client.invalidateQueries({ queryKey: ['status-summary'] });
}
