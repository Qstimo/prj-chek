'use client';

import { TranscriptionState } from '@cairn/shared';
import { useState } from 'react';

import { ConfirmDialog } from '../ConfirmDialog';
import { FormError } from '../FormError';
import { STATE_LABELS, failureTextOf } from '../TranscriptionQueue';
import { RECORDING_TEXTS, isWorkingState, recordingNoteOf } from './constants';
import type { IProps } from './types';

/**
 * Запись созвона у саммари: плеер дорожки и повторная расшифровка.
 *
 * Отдаётся и слушается **дорожка**, а не загруженный файл, и строка
 * говорит это прямо: человек загружал видео, а слушает звук, и удивляться
 * ему здесь нечему (дизайн, 8.5). Перемотка работает сама — ручка отдаёт
 * файл с поддержкой `Range`, а `<audio controls>` ею пользуется.
 *
 * Пока расшифровка идёт, повтора нет: вторую незакрытую задачу не пустит
 * уникум в базе, и кнопка, которая всегда отказывает, хуже отсутствующей.
 */
export function SummaryRecording({
  recording,
  transcription,
  src,
  onRetry,
  isRetrying,
  retryError,
}: IProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isWorking = transcription !== null && isWorkingState(transcription.state);
  const canRetry = recording !== null && !isWorking && !isRetrying;

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{RECORDING_TEXTS.heading}</h2>

      {recording === null ? (
        <p className="text-sm text-muted-foreground">{RECORDING_TEXTS.missing}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{recordingNoteOf(recording)}</p>
          <audio data-testid="recording-audio" controls src={src} className="w-full" />
        </>
      )}

      {transcription !== null && isWorkingState(transcription.state) && (
        <p className="text-sm">{STATE_LABELS[transcription.state]}</p>
      )}

      {transcription?.state === TranscriptionState.Failed && (
        <p className="text-sm text-destructive">{failureTextOf(transcription.failureCode)}</p>
      )}

      {canRetry && (
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="rounded-md border border-border px-3 py-1 text-sm"
        >
          {RECORDING_TEXTS.retry}
        </button>
      )}

      <FormError message={retryError} />

      {isConfirming && (
        <ConfirmDialog
          label={RECORDING_TEXTS.retryLabel}
          confirmLabel={RECORDING_TEXTS.retryConfirm}
          onConfirm={() => {
            setIsConfirming(false);
            onRetry();
          }}
          onCancel={() => setIsConfirming(false)}
        >
          {RECORDING_TEXTS.retryQuestion}
        </ConfirmDialog>
      )}
    </section>
  );
}
