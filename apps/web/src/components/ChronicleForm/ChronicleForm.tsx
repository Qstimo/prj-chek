'use client';

import type { ChronicleEntryCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import { FIELD_LABELS } from './constants';
import type { ChronicleFormValues, IProps } from './types';

/** Форма записи хроники: создание и правка (ТЗ 3.6). */
export function ChronicleForm({ initial, onSubmit, error, isSubmitting = false }: IProps) {
  const [values, setValues] = useState<ChronicleFormValues>(initial);

  const canSubmit =
    values.title.trim().length > 0 && values.content.trim().length > 0 && !isSubmitting;

  function change<K extends keyof ChronicleFormValues>(
    key: K,
    value: ChronicleFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      occurredOn: values.occurredOn,
      title: values.title.trim(),
      content: values.content.trim(),
    } satisfies ChronicleEntryCreate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="occurredOn" className="block text-sm font-medium">
          {FIELD_LABELS.occurredOn}
        </label>
        <input
          id="occurredOn"
          type="date"
          value={values.occurredOn}
          onChange={(event) => change('occurredOn', event.target.value)}
          className="rounded-md border border-border px-3 py-2"
        />
      </div>

      <TextField
        id="title"
        label={FIELD_LABELS.title}
        value={values.title}
        onChange={(value) => change('title', value)}
      />
      <TextField
        id="content"
        label={FIELD_LABELS.content}
        value={values.content}
        onChange={(value) => change('content', value)}
        multiline
      />

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
