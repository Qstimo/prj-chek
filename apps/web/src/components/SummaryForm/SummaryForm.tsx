'use client';

import { normalizeSummaryText } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { today } from '@/utils';

import { FormActions } from '../FormActions';
import { PassportFields } from './PassportFields';
import { SourceFields } from './SourceFields';
import { FORM_TEXTS, SummarySource, isRecordingMode } from './constants';
import type { IReadRecording } from './readRecording';
import type { IProps, ISummaryFormValues } from './types';

/**
 * Создание саммари: паспорт, текст — тремя способами, одно действие.
 *
 * Третий способ — **запись созвона**, и он добавляет к форме ровно одну
 * развилку отправки: вместо `POST …/summaries` с готовым текстом уходит
 * `POST …/transcriptions` с паспортом и сырыми байтами, а саммари родится
 * позже, из расшифровки (дизайн расшифровки, 8.2). Без пропса `recording`
 * формы записи нет вовсе, и форма работает ровно как в первой итерации.
 *
 * Пока запись отправляется, отправить нельзя ничего: кнопка выключена, а
 * процент идёт рядом с выбором файла.
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

  const isRecording = isRecordingMode(values.source, recording);
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
      <PassportFields projects={projects} values={values} onChange={change} />

      <SourceFields
        source={values.source}
        text={values.text}
        {...(recording === undefined ? {} : { recording })}
        onSource={(source) => change('source', source)}
        onText={(text) => change('text', text)}
        onPick={setPicked}
      />

      <FormActions
        submitLabel={isRecording ? FORM_TEXTS.submitRecording : FORM_TEXTS.submit}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting || isUploading}
        error={textError ?? error}
      />
    </form>
  );
}
