'use client';

import { TranscriptionState, type TranscriberInfo, type TranscriptionJob } from '@cairn/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { apiClient } from '../client';
import { SUMMARY_KEYS } from './useQuerySummaries';

/**
 * Ключи кэша расшифровок.
 *
 * Очередь отдельно от истории саммари: это две разные выдачи, и опрос
 * очереди не обязан перечитывать историю на каждый тик.
 */
export const TRANSCRIPTION_KEYS = {
  queue: ['transcriptions'] as const,
  transcriber: ['transcriber'] as const,
};

/**
 * Как часто спрашивать очередь, пока в ней есть незакрытые задачи.
 *
 * Десять секунд: фоновый прогон идёт раз в двадцать, и чаще спрашивать
 * просто не о чем.
 */
export const TRANSCRIPTION_POLL_MS = 10_000;

/** Состояния, у которых работа ещё идёт. */
const UNCLOSED = [
  TranscriptionState.Queued,
  TranscriptionState.Extracting,
  TranscriptionState.Sending,
  TranscriptionState.Running,
];

/**
 * Пауза до следующего опроса либо `false` — опрашивать нечего.
 *
 * Опрос включён **только пока в ответе есть незакрытая задача**: иначе
 * открытая вкладка стучала бы в API вечно. У неудачи своего хода нет — её
 * двигает человек, нажимая «Расшифровать снова» или «Удалить», — и опрашивать
 * очередь из одних неудач незачем (дизайн, 8.3).
 */
export function pollIntervalOf(jobs: TranscriptionJob[] | undefined): number | false {
  const isWorking = (jobs ?? []).some((job) => UNCLOSED.includes(job.state));

  return isWorking ? TRANSCRIPTION_POLL_MS : false;
}

/**
 * Очередь расшифровок по всем проектам, куда можно писать хронику.
 *
 * Исчезновение строки из очереди перечитывает историю саммари, и это не
 * удобство, а единственный способ увидеть результат: `done` в очередь не
 * попадает — саммари появилось в истории ниже, и две строки об одном были
 * бы двумя правдами (дизайн, 8.3). Без этого человек видел бы, как строка
 * пропала, и пустую историю до перезагрузки страницы.
 */
export function useQueryTranscriptions() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: TRANSCRIPTION_KEYS.queue,
    queryFn: () => apiClient<TranscriptionJob[]>('/summaries/transcriptions'),
    refetchInterval: ({ state }) => pollIntervalOf(state.data),
  });
  const known = useRef<string[]>([]);
  const ids = (query.data ?? []).map((job) => job.id).join(',');

  useEffect(() => {
    const present = ids.length === 0 ? [] : ids.split(',');
    const gone = known.current.some((id) => !present.includes(id));

    known.current = present;

    if (gone) {
      void client.invalidateQueries({ queryKey: SUMMARY_KEYS.all });
    }
  }, [ids, client]);

  return query;
}

/**
 * Настройки расшифровки: куда уйдёт запись и что из неё уйдёт.
 *
 * Нужны постоянной подписи о передаче наружу (дизайн, 9.2) и проверкам в
 * браузере (пределы и список контейнеров), поэтому запрашиваются до
 * всякого выбора файла. Ключа в ответе нет и быть не может.
 *
 * `staleTime: Infinity` — как у настроек предложителя: это настройка
 * установки, а не данные проекта, и перечитывать её на каждое открытие
 * экрана незачем.
 */
export function useQueryTranscriber() {
  return useQuery({
    queryKey: TRANSCRIPTION_KEYS.transcriber,
    queryFn: () => apiClient<TranscriberInfo>('/summaries/transcriber'),
    staleTime: Infinity,
  });
}
