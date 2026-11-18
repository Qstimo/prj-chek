'use client';

import { normalizeSummaryText } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { today } from '@/utils';

import { FormActions } from '../FormActions';
import { Select } from '../Select';
import { TextField } from '../TextField';
import { RecordingField } from './RecordingField';
import { TextFileField } from './TextFileField';
import { FIELD_LABELS, FORM_TEXTS, SOURCE_LABELS, SummarySource } from './constants';
import type { IReadRecording } from './readRecording';
import type { IProps, ISummaryFormValues } from './types';

/**
 * Создание саммари: проект, дата, заголовок и текст — тремя способами.
 *
 * Проект сохранённого саммари неизменяем, поэтому спрашивается здесь и
 * больше нигде: перенос в другой проект сломал бы и происхождение записи
 * хроники, и проверку прав, которая уже состоялась (дизайн, раздел 7.2).
 *
 * Третий способ — **запись созвона**, и он выбирается переключателем над
 * полем: выбор записи убирает поле текста, потому что текста ещё нет —
 * саммари родится из расшифровки, через минуты после того, как панель
 * закроется (дизайн расшифровки, 8.2). Без пропса `recording` формы записи
 * нет вовсе, и форма работает ровно как в первой итерации.
 */
export function SummaryForm({
  projects,
  onSubmit,
  recording,
  error,
  isSubmitting = false,
}: IProps) {
  const [values, setValues] = useState<ISummaryFormValues>({
    projectId: projects[0]?.id ?? '',
    occurredOn: today(),
    title: '',
    text: '',
    source: SummarySource.Text,
  });
  const [textError, setTextError] = useState<string>();
  const [picked, setPicked] = useState<IReadRecording>();

  const canChooseRecording = recording !== undefined && recording.transcriber.isEnabled;
  const isRecording = canChooseRecording && values.source === SummarySource.Recording;
  const isUploading = recording?.percent !== undefined;
  const canSubmit =
    values.projectId.length > 0 &&
    values.title.trim().length > 0 &&
    (isRecording ? picked !== undefined : values.text.trim().length > 0) &&
    !isSubmitting &&
    !isUploading;

  function change<K extends keyof ISummaryFormValues>(key: K, value: ISummaryFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    if (isRecording && picked !== undefined && recording !== undefined) {
      recording.onSubmit(
        values.projectId,
        { occurredOn: values.occurredOn, title: values.title.trim() },
        picked,
      );

      return;
    }

    try {
      // Та же нормализация, что на сервере: отказать здесь честнее, чем
      // получить `400` на том же самом месте.
      const text = normalizeSummaryText(values.text).trim();

      setTextError(undefined);
      onSubmit(values.projectId, {
        occurredOn: values.occurredOn,
        title: values.title.trim(),
        text,
      });
    } catch {
      setTextError(FORM_TEXTS.notPlain);
    }
  }

  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">{FORM_TEXTS.noProjects}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="projectId" className="block text-sm font-medium">
          {FIELD_LABELS.projectId}
        </label>
        <Select
          id="projectId"
          value={values.projectId}
          onChange={(projectId) => change('projectId', projectId)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>

      <TextField
        id="occurredOn"
        label={FIELD_LABELS.occurredOn}
        type="date"
        value={values.occurredOn}
        onChange={(occurredOn) => change('occurredOn', occurredOn)}
      />

      <TextField
        id="title"
        label={FIELD_LABELS.title}
        value={values.title}
        onChange={(title) => change('title', title)}
      />

      {canChooseRecording && (
        <div className="space-y-1">
          <label htmlFor="source" className="block text-sm font-medium">
            {FIELD_LABELS.source}
          </label>
          <Select
            id="source"
            value={values.source}
            onChange={(source) => change('source', source as SummarySource)}
          >
            {Object.values(SummarySource).map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Служба не настроена: предложить загрузку впустую нельзя, а
          промолчать — заставить искать то, чего нет (дизайн, 7.5). */}
      {recording !== undefined && !recording.transcriber.isEnabled && (
        <p className="text-xs text-muted-foreground">{FORM_TEXTS.transcriberDisabled}</p>
      )}

      {isRecording && recording !== undefined ? (
        <RecordingField
          transcriber={recording.transcriber}
          {...(recording.percent === undefined ? {} : { percent: recording.percent })}
          {...(recording.onCancel === undefined ? {} : { onCancel: recording.onCancel })}
          {...(recording.error === undefined ? {} : { error: recording.error })}
          onPick={setPicked}
        />
      ) : (
        <>
          <TextField
            id="text"
            label={FIELD_LABELS.text}
            value={values.text}
            onChange={(text) => change('text', text)}
            multiline
          />

          <TextFileField hasText={values.text.length > 0} onText={(text) => change('text', text)} />
        </>
      )}

      <FormActions
        submitLabel={isRecording ? FORM_TEXTS.submitRecording : FORM_TEXTS.submit}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting || isUploading}
        error={textError ?? error}
      />
    </form>
  );
}
