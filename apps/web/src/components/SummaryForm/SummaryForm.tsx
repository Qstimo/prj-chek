'use client';

import { normalizeSummaryText } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { today } from '@/utils';

import { FormActions } from '../FormActions';
import { Select } from '../Select';
import { TextField } from '../TextField';
import { TextFileField } from './TextFileField';
import { FIELD_LABELS, FORM_TEXTS } from './constants';
import type { IProps, ISummaryFormValues } from './types';

/**
 * Создание саммари: проект, дата, заголовок, текст и загрузка файла.
 *
 * Проект сохранённого саммари неизменяем, поэтому спрашивается здесь и
 * больше нигде: перенос в другой проект сломал бы и происхождение записи
 * хроники, и проверку прав, которая уже состоялась (дизайн, раздел 7.2).
 */
export function SummaryForm({ projects, onSubmit, error, isSubmitting = false }: IProps) {
  const [values, setValues] = useState<ISummaryFormValues>({
    projectId: projects[0]?.id ?? '',
    occurredOn: today(),
    title: '',
    text: '',
  });
  const [textError, setTextError] = useState<string>();

  const canSubmit =
    values.projectId.length > 0 &&
    values.title.trim().length > 0 &&
    values.text.trim().length > 0 &&
    !isSubmitting;

  function change<K extends keyof ISummaryFormValues>(key: K, value: ISummaryFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
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

      <TextField
        id="text"
        label={FIELD_LABELS.text}
        value={values.text}
        onChange={(text) => change('text', text)}
        multiline
      />

      <TextFileField hasText={values.text.length > 0} onText={(text) => change('text', text)} />

      <FormActions
        submitLabel={FORM_TEXTS.submit}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        error={textError ?? error}
      />
    </form>
  );
}
