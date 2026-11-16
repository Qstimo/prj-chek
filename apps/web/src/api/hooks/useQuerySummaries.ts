'use client';

import type { ProjectMetadata, SummaryDetail, SummaryListItem, TaskSuggesterInfo } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/**
 * Ключи кэша саммари.
 *
 * Цели и настройки предложителя вынесены из корня `summaries` намеренно:
 * сброс истории после правки черновика не обязан перечитывать ни список
 * проектов, ни настройки процесса, которые меняются развёртыванием.
 */
export const SUMMARY_KEYS = {
  all: ['summaries'] as const,
  detail: (projectId: string, summaryId: string) =>
    ['summaries', projectId, summaryId] as const,
  targets: ['summary-targets'] as const,
  suggester: ['task-suggester'] as const,
};

/** История саммари по всем проектам, куда субъект может писать хронику. */
export function useQuerySummaries() {
  return useQuery({
    queryKey: SUMMARY_KEYS.all,
    queryFn: () => apiClient<SummaryListItem[]>('/summaries'),
  });
}

/** Цели первого шага: проекты с уровнем записи на «Хронику». */
export function useQuerySummaryTargets() {
  return useQuery({
    queryKey: SUMMARY_KEYS.targets,
    queryFn: () => apiClient<ProjectMetadata[]>('/summaries/projects'),
  });
}

/**
 * Саммари целиком: текст, черновик, подсказка обозначения версии.
 *
 * Проект приходит снаружи, а не из адреса страницы: ручка детали живёт
 * под проектом (`/projects/:projectId/summaries/:id`), потому что там же
 * живёт проверка права. Пока проект неизвестен, запрос не идёт.
 */
export function useQuerySummary(projectId: string | undefined, summaryId: string) {
  return useQuery({
    queryKey: SUMMARY_KEYS.detail(projectId ?? '', summaryId),
    enabled: projectId !== undefined,
    queryFn: () => apiClient<SummaryDetail>(`/projects/${projectId}/summaries/${summaryId}`),
  });
}

/**
 * Настройки предложителя: куда уходит текст и какая модель его разбивает.
 *
 * Нужны постоянной подписи о передаче наружу (дизайн, раздел 5.7), и
 * потому запрашиваются до всякого нажатия. Ключа API в ответе нет и быть
 * не может.
 */
export function useQueryTaskSuggester() {
  return useQuery({
    queryKey: SUMMARY_KEYS.suggester,
    queryFn: () => apiClient<TaskSuggesterInfo>('/summaries/suggester'),
    // Настройки процесса меняются только развёртыванием: перечитывать их
    // на каждое открытие экрана незачем.
    staleTime: Infinity,
  });
}
