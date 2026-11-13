'use client';

import type { PushCheckResponse, PushKeyResponse, PushSubscribeRequest } from '@cairn/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша пушей. */
export const PUSH_KEYS = {
  publicKey: ['push', 'key'] as const,
};

/**
 * Публичный VAPID-ключ.
 *
 * `null` означает, что уведомления выключены на сервере: ключи не заданы,
 * и кнопку показывать незачем.
 */
export function useQueryPushKey() {
  return useQuery({
    queryKey: PUSH_KEYS.publicKey,
    queryFn: () => apiClient<PushKeyResponse>('/push/key'),
  });
}

/** Заводит подписку этого устройства. */
export function useMutationPushSubscribe() {
  return useMutation({
    mutationFn: (body: PushSubscribeRequest) =>
      apiClient('/push/subscriptions', { method: 'POST', body }),
  });
}

/**
 * Спрашивает сервер, числится ли адрес устройства за текущим субъектом.
 *
 * `POST`, а не `GET`: адрес подписки не должен попадать в URL и логи.
 * Мутация, а не запрос, по той же причине — кэшировать тут нечего.
 */
export function useMutationPushCheck() {
  return useMutation({
    mutationFn: (endpoint: string) =>
      apiClient<PushCheckResponse>('/push/subscriptions/status', {
        method: 'POST',
        body: { endpoint },
      }),
  });
}

/** Снимает подписку этого устройства. */
export function useMutationPushUnsubscribe() {
  return useMutation({
    mutationFn: (endpoint: string) =>
      apiClient('/push/subscriptions', { method: 'DELETE', body: { endpoint } }),
  });
}
