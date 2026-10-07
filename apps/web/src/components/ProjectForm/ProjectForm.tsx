'use client';

import type { ProjectUpdate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { FormError } from '../FormError';
import { ProjectFields } from './ProjectFields';
import type { IProps, ProjectFormValues } from './types';

/** Форма паспорта проекта: создание и правка (спека 9.1). */
export function ProjectForm({
  initial,
  onSubmit,
  error,
  isSubmitting = false,
  platformsSlot,
}: IProps) {
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
      <ProjectFields values={values} onChange={change} />

      {platformsSlot}

      <FormError message={error} />

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
