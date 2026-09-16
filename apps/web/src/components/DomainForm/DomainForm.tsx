'use client';

import type { DomainCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import { FIELD_LABELS, NAME_HINT } from './constants';
import type { DomainFormValues, IProps } from './types';
import { FormError } from '../FormError';

/** Форма корневого домена: создание и правка (спека этапа 10, раздел 7). */
export function DomainForm({
  initial,
  onSubmit,
  error,
  isSubmitting = false,
  isNameLocked = false,
}: IProps) {
  const [values, setValues] = useState<DomainFormValues>(initial);

  const canSubmit = values.name.trim().length > 0 && !isSubmitting;

  function change<K extends keyof DomainFormValues>(key: K, value: DomainFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      name: values.name.trim().toLowerCase(),
      owner: emptyToNull(values.owner),
      registrar: emptyToNull(values.registrar),
      paidUntil: emptyToNull(values.paidUntil),
      notes: emptyToNull(values.notes),
    } satisfies DomainCreate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isNameLocked ? (
        <p className="text-sm text-muted-foreground">Домен: {values.name}</p>
      ) : (
        <div className="space-y-1">
          <TextField
            id="name"
            label={FIELD_LABELS.name}
            value={values.name}
            onChange={(value) => change('name', value)}
          />
          <p className="text-xs text-muted-foreground">{NAME_HINT}</p>
        </div>
      )}

      <TextField
        id="owner"
        label={FIELD_LABELS.owner}
        value={values.owner ?? ''}
        onChange={(value) => change('owner', value)}
      />
      <TextField
        id="registrar"
        label={FIELD_LABELS.registrar}
        value={values.registrar ?? ''}
        onChange={(value) => change('registrar', value)}
      />
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
