'use client';

import { useEffect, useState } from 'react';

import { limitOf } from '@/utils';

import { FileField, pickedNoteOf } from '../FileField';
import { FormError } from '../FormError';
import {
  FIELD_LABELS,
  FORM_TEXTS,
  formatsOf,
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
 * медленному каналу это десятки минут. Путь один и у кнопки, и у броска:
 * второй его экземпляр разошёлся бы с первым порядком проверок.
 *
 * Процент настоящий: загрузка идёт через `XMLHttpRequest`, у которого есть
 * событие прогресса. Неопределённый индикатор на двадцать минут читался бы
 * как зависший экран.
 */
export function RecordingField({
  transcriber,
  percent,
  onCancel,
  error,
  onPick,
  droppedFile,
}: IRecordingProps) {
  const [pickError, setPickError] = useState<string>();
  const [picked, setPicked] = useState<string>();
  const isUploading = percent !== undefined;

  async function take(file: File): Promise<void> {
    setPickError(undefined);
    setPicked(undefined);
    onPick(undefined);

    try {
      const read = await readRecording(file, transcriber);

      // Формат и размер, но не имя: имена файлов на машинах людей нередко
      // говорят больше содержимого.
      setPicked(pickedNoteOf(formatsOf([read.uploadType]), limitOf(read.bytes)));
      onPick(read);
    } catch (cause) {
      setPickError(
        (cause instanceof RecordingError
          ? recordingErrorOf(cause.code, transcriber)
          : undefined) ?? FORM_TEXTS.unreadable,
      );
    }
  }

  // Запись, брошенная на экран саммари, проверяется тем же путём: форма
  // открывается с файлом уже в руках.
  useEffect(() => {
    if (droppedFile !== undefined) {
      void take(droppedFile);
    }
  }, [droppedFile]);

  return (
    <div className="space-y-1">
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs">
        {recordingNoticeOf(transcriber)}
      </p>

      <FileField
        id="recording"
        label={FIELD_LABELS.recording}
        accept={transcriber.acceptedTypes.join(',')}
        hint={recordingHintOf(transcriber)}
        isDisabled={isUploading}
        onFile={(file) => void take(file)}
        {...(picked === undefined ? {} : { picked })}
      />

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
