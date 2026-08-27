'use client';

import type { ProjectLifecycle, ProjectUpdate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import { FIELD_LABELS, LIFECYCLE_OPTIONS } from './constants';
import type { IProps, ProjectFormValues } from './types';

/** Форма паспорта проекта: создание и правка (спека 9.1). */
export function ProjectForm({ initial, onSubmit, error, isSubmitting = false }: IProps) {
  const [values, setValues] = useState<ProjectFormValues>(initial);

  const canSubmit = values.name.trim().length > 0 && !isSubmitting;

  function change<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      name: values.name.trim(),
      purpose: emptyToNull(values.purpose),
      stack: emptyToNull(values.stack),
      repoUrl: emptyToNull(values.repoUrl),
      notes: emptyToNull(values.notes),
      lifecycle: values.lifecycle,
    } satisfies ProjectUpdate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        id="name"
        label={FIELD_LABELS.name}
        value={values.name}
        onChange={(value) => change('name', value)}
      />
      <TextField
        id="purpose"
        label={FIELD_LABELS.purpose}
        value={values.purpose ?? ''}
        onChange={(value) => change('purpose', value)}
        multiline
      />
      <TextField
        id="stack"
        label={FIELD_LABELS.stack}
        value={values.stack ?? ''}
        onChange={(value) => change('stack', value)}
      />
      <TextField
        id="repoUrl"
        label={FIELD_LABELS.repoUrl}
        value={values.repoUrl ?? ''}
        onChange={(value) => change('repoUrl', value)}
      />
      <TextField
        id="notes"
        label={FIELD_LABELS.notes}
        value={values.notes ?? ''}
        onChange={(value) => change('notes', value)}
        multiline
      />

      <div className="space-y-1">
        <label htmlFor="lifecycle" className="block text-sm font-medium">
          {FIELD_LABELS.lifecycle}
        </label>
        <select
          id="lifecycle"
          value={values.lifecycle}
          onChange={(event) => change('lifecycle', event.target.value as ProjectLifecycle)}
          className="w-full rounded-md border border-border px-3 py-2"
        >
          {LIFECYCLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  );
}

/** Превращает пустую строку в отсутствие значения. */
function emptyToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';

  return trimmed.length > 0 ? trimmed : null;
}
