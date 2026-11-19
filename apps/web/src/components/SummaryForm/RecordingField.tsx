'use client';

import { useState, type ChangeEvent } from 'react';

import { FormError } from '../FormError';
import {
  FIELD_LABELS,
  FORM_TEXTS,
  recordingErrorOf,
  recordingHintOf,
  recordingNoticeOf,
} from './constants';
import { RecordingError, readRecording } from './readRecording';
import type { IRecordingProps } from './types';

/**
 * Выбор записи созвона: подпись о передаче, проверки, процент отправки.
 *
 * Проверки идут **при выборе файла**, а не при отправке, и порядок у них
 * обязательный: размер, расширение, подпись (дизайн, 8.2). Отказ до
 * отправки экономит не минуту ожидания, а всю загрузку — два гигабайта по
 * медленному каналу это десятки минут.
 *
 * Процент настоящий: загрузка идёт через `XMLHttpRequest`, у которого есть
 * событие прогресса. Неопределённый индикатор на двадцать минут читался бы
 * как зависший экран.
 */
export function RecordingField({ transcriber, percent, onCancel, error, onPick }: IRecordingProps) {
  const [pickError, setPickError] = useState<string>();
  const isUploading = percent !== undefined;

  async function pick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Поле сбрасывается сразу: иначе выбор того же файла второй раз не
    // поднимает события, и кнопка выглядела бы мёртвой.
    event.target.value = '';
    setPickError(undefined);
    onPick(undefined);

    if (!file) {
      return;
    }

    try {
      onPick(await readRecording(file, transcriber));
    } catch (cause) {
      setPickError(
        (cause instanceof RecordingError
          ? recordingErrorOf(cause.code, transcriber)
          : undefined) ?? FORM_TEXTS.unreadable,
      );
    }
  }

  return (
    <div className="space-y-1">
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs">
        {recordingNoticeOf(transcriber)}
      </p>

      <label htmlFor="recording" className="block text-sm font-medium">
        {FIELD_LABELS.recording}
      </label>
      <input
        id="recording"
        type="file"
        accept={transcriber.acceptedTypes.join(',')}
        disabled={isUploading}
        onChange={(event) => void pick(event)}
        className="block w-full text-sm"
      />
      <p className="text-xs text-muted-foreground">{recordingHintOf(transcriber)}</p>

      {isUploading && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={FORM_TEXTS.uploading}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{`${FORM_TEXTS.uploading} ${percent}%`}</p>
          {onCancel !== undefined && (
            <button type="button" onClick={onCancel} className="text-xs underline">
              {FORM_TEXTS.cancelUpload}
            </button>
          )}
        </div>
      )}

      <FormError message={pickError ?? error} />
    </div>
  );
}
