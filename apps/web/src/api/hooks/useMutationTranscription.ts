'use client';

import type { TranscriptionJob } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { uploadRecording } from '../upload-recording';
import { SUMMARY_KEYS } from './useQuerySummaries';
import { TRANSCRIPTION_KEYS } from './useQueryTranscriptions';

/** Паспорт будущего саммари: его вводит человек в форме. */
export interface ITranscriptionPassport {
  occurredOn: string;
  title: string;
}

/** Запись, прошедшая проверки браузера (`readRecording`). */
export interface IRecordingUpload {
  file: File;
  uploadType: string;
}

/** Что нужно загрузке: куда, что и чем управлять по ходу. */
export interface IUploadInput {
  projectId: string;
  passport: ITranscriptionPassport;
  recording: IRecordingUpload;
  /** Процент отправки: без него индикатор на двадцать минут был бы слепым. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** Адрес задачи в её проекте: очередь сводная, и проект у строки свой. */
function jobPath(projectId: string, jobId: string): string {
  return `/projects/${projectId}/summaries/transcriptions/${jobId}`;
}

/**
 * Загрузка записи: паспорт строкой запроса, тело — сырые байты.
 *
 * Идёт через {@link uploadRecording} на `XMLHttpRequest`, а не через общий
 * клиент: `fetch` не даёт прогресса отправки, а на двух гигабайтах
 * прогресс обязателен (дизайн, 8.4). Имя файла не уходит ни в адрес, ни в
 * тело — его не получает даже сервер.
 */
export function useMutationUploadRecording() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, passport, recording, onProgress, signal }: IUploadInput) => {
      const query = new URLSearchParams({
        occurredOn: passport.occurredOn,
        title: passport.title,
        uploadType: recording.uploadType,
      });

      return uploadRecording<TranscriptionJob>(
        `/projects/${projectId}/summaries/transcriptions?${query.toString()}`,
        recording.file,
        recording.uploadType,
        { ...(onProgress === undefined ? {} : { onProgress }), ...(signal === undefined ? {} : { signal }) },
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: TRANSCRIPTION_KEYS.queue }),
  });
}

/**
 * Отмена задачи: строка закрывается кодом `transcription_cancelled`.
 *
 * Отменять нечего только у отправки — байты уже в пути; у извлечения
 * отмена действительно прерывает работу, и это единственная отмена в
 * системе, которая не просто закрывает строку (дизайн, 2.3).
 */
export function useMutationCancelTranscription() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, jobId }: { projectId: string; jobId: string }) =>
      apiClient<TranscriptionJob>(`${jobPath(projectId, jobId)}/cancel`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: TRANSCRIPTION_KEYS.queue }),
  });
}

/**
 * Удаление задачи вместе с её файлами.
 *
 * Единственный способ убрать неудавшуюся расшифровку: иначе загруженное
 * видео на полгигабайта осталось бы на томе навсегда (дизайн, 2.5 п. 3).
 */
export function useMutationDeleteTranscription() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, jobId }: { projectId: string; jobId: string }) =>
      apiClient<void>(jobPath(projectId, jobId), { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: TRANSCRIPTION_KEYS.queue }),
  });
}

/**
 * Повторная расшифровка существующего саммари.
 *
 * Паспорта не принимает: он уже есть у записи хроники, и второй копии не
 * бывает. Работает и после уборки исходника — новая задача берёт дорожку
 * (дизайн, 3.3).
 *
 * Сбрасывает и очередь, и само саммари: это одна задача, прочитанная с
 * двух сторон, и разъехавшаяся пара читалась бы как «повтор не начался».
 */
export function useMutationRetryTranscription() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, summaryId }: { projectId: string; summaryId: string }) =>
      apiClient<TranscriptionJob>(`/projects/${projectId}/summaries/${summaryId}/transcriptions`, {
        method: 'POST',
      }),
    onSuccess: async (_job, { projectId, summaryId }) => {
      await client.invalidateQueries({ queryKey: TRANSCRIPTION_KEYS.queue });
      await client.invalidateQueries({ queryKey: SUMMARY_KEYS.detail(projectId, summaryId) });
    },
  });
}
