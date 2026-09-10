'use client';

import type { DomainCreate, DomainUpdate } from '@cairn/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { DOMAIN_KEYS } from './useQueryDomains';

/**
 * Заводит корневой домен.
 *
 * Тип ответа не объявляется: API отдаёт сырую строку таблицы без
 * индикатора и счётчиков. Результат нужен только для инвалидации.
 */
export function useMutationCreateDomain() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: DomainCreate) =>
      apiClient('/domains', { method: 'POST', body: input }),
    onSuccess: () => invalidateDomainViews(client),
  });
}

/** Правит корневой домен. */
export function useMutationUpdateDomain() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DomainUpdate }) =>
      apiClient(`/domains/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => invalidateDomainViews(client),
  });
}

/** Удаляет корневой домен. Занятый корень удалить нельзя. */
export function useMutationDeleteDomain() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient(`/domains/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateDomainViews(client),
  });
}

/**
 * Сбрасывает всё, на что влияет правка домена.
 *
 * Статусы проектов — не лишнее: срок продления корня поднимает индикатор
 * каждого проекта на нём, и оставить их в кэше значило бы показывать
 * вчерашнюю картину.
 */
async function invalidateDomainViews(client: QueryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: DOMAIN_KEYS.all });
  await client.invalidateQueries({ queryKey: ['status'] });
  await client.invalidateQueries({ queryKey: ['status-summary'] });
}
