'use client';

import type {
  RoadmapVersionCreate,
  SummaryCreate,
  SummaryDetail,
  SummaryReleaseResult,
  SummaryTasksReplace,
} from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ApiError } from '../errors';
import { CHRONICLE_KEYS } from './useQueryChronicle';
import { ROADMAP_KEYS } from './useQueryRoadmap';
import { SUMMARY_KEYS } from './useQuerySummaries';

/** Отказ потока саммари, разобранный по контракту. */
export interface ISummaryFailure {
  /** Код из тела отказа; отсутствует у сетевых и прочих ответов без него. */
  code?: string;
  /** Предел объёма предложителя — только у `summary_text_too_long`. */
  maxChars?: number;
}

/**
 * Достаёт код отказа из ответа сервера.
 *
 * Код, а не разбор текста: фразу в ответе можно переписать, код — нет
 * (`CARRY_OVER_NEEDS_LABEL` заведён по той же причине). Предел объёма
 * берётся оттуда же, потому что он настройка узла: подставить своё число
 * значило бы соврать о чужой настройке.
 *
 * Кода нет — поле пустое, и экран говорит общими словами: подменять
 * сетевой сбой кодом порта значило бы объяснить не то, что случилось.
 */
export function summaryFailureOf(error: unknown): ISummaryFailure {
  if (!(error instanceof ApiError)) {
    return {};
  }

  const details = error.details as { code?: unknown; maxChars?: unknown } | null;
  const code = typeof details?.code === 'string' ? details.code : undefined;
  const maxChars = typeof details?.maxChars === 'number' ? details.maxChars : undefined;

  return { ...(code === undefined ? {} : { code }), ...(maxChars === undefined ? {} : { maxChars }) };
}

/**
 * Сброс кэшей после правки саммари.
 *
 * История и деталь всегда вместе: число задач и состояние строки
 * считаются из того же содержимого, что лежит в детали, и разъехавшаяся
 * пара читалась бы как «сохранилось не то».
 */
function useSummaryInvalidation(projectId: string, summaryId?: string) {
  const client = useQueryClient();

  return async () => {
    await client.invalidateQueries({ queryKey: SUMMARY_KEYS.all });

    if (summaryId !== undefined) {
      await client.invalidateQueries({ queryKey: SUMMARY_KEYS.detail(projectId, summaryId) });
    }
  };
}

/** Создание саммари: текст ложится в хронику той же транзакцией. */
export function useMutationCreateSummary(projectId: string) {
  const client = useQueryClient();
  const invalidate = useSummaryInvalidation(projectId);

  return useMutation({
    mutationFn: (input: SummaryCreate) =>
      apiClient<SummaryDetail>(`/projects/${projectId}/summaries`, { method: 'POST', body: input }),
    onSuccess: async () => {
      await invalidate();
      // В ленте проекта появилась запись: её источник — «Саммари созвона».
      await client.invalidateQueries({ queryKey: CHRONICLE_KEYS.forProject(projectId) });
    },
  });
}

/**
 * Разбивка текста на задачи через порт.
 *
 * Тела у запроса нет: что разбивать, сервер знает по адресу саммари, и
 * второе место для текста разошлось бы с первым.
 */
export function useMutationSuggestSummaryTasks(projectId: string, summaryId: string) {
  const invalidate = useSummaryInvalidation(projectId, summaryId);

  return useMutation({
    mutationFn: () =>
      apiClient<SummaryDetail>(`/projects/${projectId}/summaries/${summaryId}/tasks/suggest`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });
}

/** Полная замена черновика: порядок задаёт порядок массива. */
export function useMutationSaveSummaryTasks(projectId: string, summaryId: string) {
  const invalidate = useSummaryInvalidation(projectId, summaryId);

  return useMutation({
    mutationFn: (input: SummaryTasksReplace) =>
      apiClient<SummaryDetail>(`/projects/${projectId}/summaries/${summaryId}/tasks`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Формирование релиза: версия с чекпоинтами одной транзакцией.
 *
 * Тело — общая `RoadmapVersionCreate`, и форма наполняет в нём ровно три
 * поля: обозначение, состояние и плановую дату. `releasedDate` не уходит
 * никогда, даже как `null` (дизайн, раздел 7.5).
 */
export function useMutationReleaseSummary(projectId: string, summaryId: string) {
  const client = useQueryClient();
  const invalidate = useSummaryInvalidation(projectId, summaryId);

  return useMutation({
    mutationFn: (input: RoadmapVersionCreate) =>
      apiClient<SummaryReleaseResult>(`/projects/${projectId}/summaries/${summaryId}/release`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: async () => {
      await invalidate();
      await client.invalidateQueries({ queryKey: CHRONICLE_KEYS.forProject(projectId) });
      // В роадмапе появились версия и чекпоинты: открытая рядом полоса
      // иначе показывала бы роадмап без них.
      await client.invalidateQueries({ queryKey: ROADMAP_KEYS.forProject(projectId) });
    },
  });
}

/** Удаление саммари с черновиком. Запись хроники остаётся. */
export function useMutationDeleteSummary(projectId: string) {
  const invalidate = useSummaryInvalidation(projectId);

  return useMutation({
    mutationFn: (summaryId: string) =>
      apiClient<void>(`/projects/${projectId}/summaries/${summaryId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
