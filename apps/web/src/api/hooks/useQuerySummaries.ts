'use client';

import {
  TranscriptionState,
  type ProjectMetadata,
  type SummaryDetail,
  type SummaryListItem,
  type TaskSuggesterInfo,
} from '@cairn/shared';
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
 * Как часто перезапрашивать деталь, пока расшифровка не закончена.
 *
 * Десять секунд — та же пауза, что у очереди на `/summaries`: фоновый
 * прогон идёт раз в двадцать, и чаще спрашивать просто не о чем.
 */
export const SUMMARY_POLL_MS = 10_000;

/**
 * Состояния, у которых работа ещё идёт.
 *
 * Свой перечень, а не `UNCLOSED` очереди расшифровок: тот модуль читает
 * `SUMMARY_KEYS` отсюда, и импорт в обратную сторону замкнул бы два
 * файла друг на друга. Перечислены именно незакрытые, а не исключены
 * закрытые: новое состояние тогда опрос прекратит, а не оставит вечный
 * таймер на экране, где ничего не меняется.
 */
const UNCLOSED = [
  TranscriptionState.Queued,
  TranscriptionState.Extracting,
  TranscriptionState.Sending,
  TranscriptionState.Running,
];

/**
 * Пауза до следующего опроса либо `false` — опрашивать нечего.
 *
 * Опрос включён **только пока расшифровка этого саммари не закончена**:
 * состояние обработки видно на самом экране, без перехода в список
 * (дизайн, 4.2), но вечный таймер на готовом саммари гонял бы базу без
 * повода. У неудачи своего хода нет — её двигает человек кнопкой
 * «Расшифровать снова», — а у саммари, набранного руками, расшифровки
 * нет вовсе.
 */
export function summaryPollIntervalOf(summary: SummaryDetail | undefined): number | false {
  const state = summary?.transcription?.state;

  return state !== undefined && UNCLOSED.includes(state) ? SUMMARY_POLL_MS : false;
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
    refetchInterval: ({ state }) => summaryPollIntervalOf(state.data),
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
