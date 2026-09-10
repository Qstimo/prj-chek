'use client';

import type { ServerCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import { FIELD_LABELS, TEXT_FIELDS } from './constants';
import type { IProps, ServerFormValues } from './types';

/** Форма сервера: создание и правка (спека этапа 9, раздел 7). */
export function ServerForm({ initial, onSubmit, error, isSubmitting = false }: IProps) {
  const [values, setValues] = useState<ServerFormValues>(initial);

  const canSubmit = values.name.trim().length > 0 && !isSubmitting;

  function change<K extends keyof ServerFormValues>(key: K, value: ServerFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      name: values.name.trim(),
      owner: emptyToNull(values.owner),
      host: emptyToNull(values.host),
      ip: emptyToNull(values.ip),
      provider: emptyToNull(values.provider),
      specs: emptyToNull(values.specs),
      paidUntil: emptyToNull(values.paidUntil),
      notes: emptyToNull(values.notes),
    } satisfies ServerCreate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        id="name"
        label={FIELD_LABELS.name}
        value={values.name}
        onChange={(value) => change('name', value)}
      />

      {TEXT_FIELDS.map((field) => (
        <TextField
          key={field}
          id={field}
          label={FIELD_LABELS[field]}
          value={values[field] ?? ''}
          onChange={(value) => change(field, value)}
        />
      ))}

      <TextField
        id="paidUntil"
        label={FIELD_LABELS.paidUntil}
        type="date"
        value={values.paidUntil ?? ''}
        onChange={(value) => change('paidUntil', value)}
      />

      <TextField
        id="notes"
        label={FIELD_LABELS.notes}
        value={values.notes ?? ''}
        onChange={(value) => change('notes', value)}
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

/** Превращает пустую строку в отсутствие значения. */
function emptyToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';

  return trimmed.length > 0 ? trimmed : null;
}
