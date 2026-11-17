'use client';

import type {
  ModelProbeResult,
  ModelServiceKind,
  ModelServiceSettings,
  ModelServiceUpdate,
} from '@cairn/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { MODEL_SERVICE_KEYS } from './useQueryModelServices';
import { SUMMARY_KEYS } from './useQuerySummaries';

/** Задаёт настройку узла целиком. */
export function useMutationSaveModelService() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ kind, input }: { kind: ModelServiceKind; input: ModelServiceUpdate }) =>
      apiClient<ModelServiceSettings>(`/model-services/${kind}`, { method: 'PUT', body: input }),
    onSuccess: (_result, { kind }) => invalidateModelService(client, kind),
  });
}

/** Сбрасывает настройку узла к окружению. */
export function useMutationClearModelService() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (kind: ModelServiceKind) =>
      apiClient(`/model-services/${kind}`, { method: 'DELETE' }),
    onSuccess: (_result, kind) => invalidateModelService(client, kind),
  });
}

/**
 * Проверяет связь с узлом живым вызовом.
 *
 * Кэш не сбрасывает: проверка ничего не меняет, а её исход живёт в
 * состоянии экрана — он нужен человеку на экране, пока он правит поле, и
 * в кэше настроек ему места нет.
 */
export function useMutationProbeModelService() {
  return useMutation({
    mutationFn: (kind: ModelServiceKind) =>
      apiClient<ModelProbeResult>(`/model-services/${kind}/probe`, { method: 'POST' }),
  });
}

/**
 * Сбрасывает список и сам узел.
 *
 * Подпись над кнопкой разбивки — тоже: она читает действующую настройку,
 * и оставить её в кэше значило бы назвать прежний узел после смены.
 */
async function invalidateModelService(
  client: QueryClient,
  kind: ModelServiceKind,
): Promise<void> {
  await client.invalidateQueries({ queryKey: MODEL_SERVICE_KEYS.all });
  await client.invalidateQueries({ queryKey: MODEL_SERVICE_KEYS.byKind(kind) });
  await client.invalidateQueries({ queryKey: SUMMARY_KEYS.suggester });
}
