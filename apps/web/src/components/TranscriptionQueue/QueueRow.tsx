'use client';

import { TranscriptionState } from '@cairn/shared';
import { useState } from 'react';

import { formatDate } from '@/utils';

import { ConfirmDialog } from '../ConfirmDialog';
import {
  QUEUE_TEXTS,
  STATE_LABELS,
  UNCLOSED_STATES,
  elapsedOf,
  failureTextOf,
  sizesOf,
} from './constants';
import type { IRowProps } from './types';

/**
 * Одна расшифровка: что это, где она и что с ней можно сделать.
 *
 * Отмены нет ровно у `sending`: байты уже в пути, и делать вид, что их
 * можно вернуть, дизайн не будет. У `extracting` отмена есть и правда
 * прерывает работу — это единственная отмена в системе, которая отменяет
 * работу, а не только закрывает строку (дизайн, 2.3).
 *
 * «Расшифровать снова» показывается только у задачи, за которой уже есть
 * саммари: повтор идёт по адресу саммари, а у неудавшейся **первой**
 * расшифровки его нет, и повторять нечем — остаётся удалить и загрузить
 * заново.
 */
export function QueueRow({ job, now, onCancel, onRetry, onDelete }: IRowProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const isFailed = job.state === TranscriptionState.Failed;
  const canCancel = UNCLOSED_STATES.includes(job.state) && job.state !== TranscriptionState.Sending;

  return (
    <tr className="border-b border-border/50 align-top">
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
        {job.occurredOn === null ? QUEUE_TEXTS.dash : formatDate(job.occurredOn)}
      </td>
      <td className="px-3 py-2">{job.title ?? QUEUE_TEXTS.repeat}</td>
      <td className="px-3 py-2 text-muted-foreground">{job.projectName}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
        {sizesOf(job.uploadBytes, job.audioBytes)}
      </td>
      <td className="px-3 py-2">
        {isFailed ? (
          <span className="text-destructive">{failureTextOf(job.failureCode)}</span>
        ) : (
          STATE_LABELS[job.state]
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
        {isFailed ? QUEUE_TEXTS.dash : elapsedOf(job.startedAt, now)}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <button type="button" onClick={() => onCancel(job)} className={BUTTON}>
              {QUEUE_TEXTS.cancel}
            </button>
          )}
          {isFailed && job.summaryId !== null && (
            <button type="button" onClick={() => onRetry(job)} className={BUTTON}>
              {QUEUE_TEXTS.retry}
            </button>
          )}
          {isFailed && (
            <button type="button" onClick={() => setIsRemoving(true)} className={BUTTON}>
              {QUEUE_TEXTS.remove}
            </button>
          )}
        </div>

        {isRemoving && (
          <div className="mt-2">
            <ConfirmDialog
              label={QUEUE_TEXTS.removeLabel}
              confirmLabel={QUEUE_TEXTS.removeConfirm}
              onConfirm={() => {
                setIsRemoving(false);
                onDelete(job);
              }}
              onCancel={() => setIsRemoving(false)}
            >
              {QUEUE_TEXTS.removeQuestion}
            </ConfirmDialog>
          </div>
        )}
      </td>
    </tr>
  );
}

/** Вид кнопки действия: тот же, что у действий истории саммари. */
const BUTTON = 'rounded-md border border-border px-3 py-1 text-sm';
