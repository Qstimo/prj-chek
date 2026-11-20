'use client';

import { Select } from '../Select';
import { TextField } from '../TextField';
import { RecordingField } from './RecordingField';
import { TextFileField } from './TextFileField';
import {
  FIELD_LABELS,
  FORM_TEXTS,
  SOURCE_LABELS,
  SummarySource,
  isRecordingMode,
} from './constants';
import type { ISourceProps } from './types';

/**
 * Чем человек даёт текст: вставкой, текстовым файлом или записью.
 *
 * Переключатель появляется только тогда, когда есть из чего выбирать:
 * без настроек службы третьего способа нет вовсе, и форма работает ровно
 * как в первой итерации. Выключенная служба переключателя не даёт, но
 * **говорит об этом**: предложить загрузку впустую нельзя, а промолчать —
 * заставить искать то, чего нет (дизайн, 7.5).
 *
 * Выбор записи убирает поле текста, потому что текста ещё нет: саммари
 * родится из расшифровки, через минуты после того, как панель закроется
 * (дизайн, 8.2).
 */
export function SourceFields({
  source,
  text,
  recording,
  droppedFile,
  onSource,
  onText,
  onPick,
}: ISourceProps) {
  const canChoose = recording !== undefined && recording.transcriber.isEnabled;

  return (
    <>
      {canChoose && (
        <div className="space-y-1">
          <label htmlFor="source" className="block text-sm font-medium">
            {FIELD_LABELS.source}
          </label>
          <Select id="source" value={source} onChange={(next) => onSource(next as SummarySource)}>
            {Object.values(SummarySource).map((value) => (
              <option key={value} value={value}>
                {SOURCE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {recording !== undefined && !recording.transcriber.isEnabled && (
        <p className="text-xs text-muted-foreground">{FORM_TEXTS.transcriberDisabled}</p>
      )}

      {isRecordingMode(source, recording) && recording !== undefined ? (
        <RecordingField
          transcriber={recording.transcriber}
          {...(recording.percent === undefined ? {} : { percent: recording.percent })}
          {...(recording.onCancel === undefined ? {} : { onCancel: recording.onCancel })}
          {...(recording.error === undefined ? {} : { error: recording.error })}
          {...(droppedFile === undefined ? {} : { droppedFile })}
          onPick={onPick}
        />
      ) : (
        <>
          {/*
            Поле на пятнадцать строк, а не на три: сюда вставляют текст
            созвона целиком, и перечитать его перед отправкой человек
            обязан иметь возможность не прокруткой в щель. Панель —
            половина экрана, места под это хватает.
          */}
          <TextField
            id="text"
            label={FIELD_LABELS.text}
            value={text}
            onChange={onText}
            multiline
            rows={15}
          />

          <TextFileField
            hasText={text.length > 0}
            onText={onText}
            {...(droppedFile === undefined ? {} : { droppedFile })}
          />
        </>
      )}
    </>
  );
}
