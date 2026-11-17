'use client';

import type { ModelServiceKind, ModelServiceSettings } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша настроек служб модели. */
export const MODEL_SERVICE_KEYS = {
  all: ['model-services'] as const,
  byKind: (kind: ModelServiceKind) => ['model-services', kind] as const,
};

/**
 * Настройки всех узлов перечня. Доступны только суперадмину.
 *
 * Ненастроенные узлы приходят вместе с настроенными: экран обязан
 * показать, что узел существует и не настроен.
 */
export function useQueryModelServices() {
  return useQuery({
    queryKey: MODEL_SERVICE_KEYS.all,
    queryFn: () => apiClient<ModelServiceSettings[]>('/model-services'),
  });
}

/** Действующая настройка узла. Ключа в ответе нет никогда. */
export function useQueryModelService(kind: ModelServiceKind) {
  return useQuery({
    queryKey: MODEL_SERVICE_KEYS.byKind(kind),
    queryFn: () => apiClient<ModelServiceSettings>(`/model-services/${kind}`),
  });
}
