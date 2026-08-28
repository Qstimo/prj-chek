'use client';

import type { EnvironmentCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { DomainsField } from '../DomainsField';
import { TextField } from '../TextField';
import { FIELD_LABELS } from './constants';
import { KindField } from './KindField';
import type { EnvironmentFormValues, IProps } from './types';

/** Форма окружения: создание и правка (ТЗ 3.2). */
export function EnvironmentForm({ initial, onSubmit, error, isSubmitting = false }: IProps) {
  const [values, setValues] = useState<EnvironmentFormValues>(initial);

  const canSubmit = values.name.trim().length > 0 && !isSubmitting;

  function change<K extends keyof EnvironmentFormValues>(
    key: K,
    value: EnvironmentFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      name: values.name.trim(),
      kind: values.kind,
      host: emptyToNull(values.host),
      ip: emptyToNull(values.ip),
      provider: emptyToNull(values.provider),
      specs: emptyToNull(values.specs),
      healthCheckUrl: emptyToNull(values.healthCheckUrl),
      notes: emptyToNull(values.notes),
      domains: values.domains,
    } satisfies EnvironmentCreate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        id="name"
        label={FIELD_LABELS.name}
        value={values.name}
        onChange={(value) => change('name', value)}
      />

      <KindField value={values.kind} onChange={(value) => change('kind', value)} />

      <TextField
        id="host"
        label={FIELD_LABELS.host}
        value={values.host ?? ''}
        onChange={(value) => change('host', value)}
      />
      <TextField
        id="ip"
        label={FIELD_LABELS.ip}
        value={values.ip ?? ''}
        onChange={(value) => change('ip', value)}
      />
      <TextField
        id="provider"
        label={FIELD_LABELS.provider}
        value={values.provider ?? ''}
        onChange={(value) => change('provider', value)}
      />
      <TextField
        id="specs"
        label={FIELD_LABELS.specs}
        value={values.specs ?? ''}
        onChange={(value) => change('specs', value)}
      />
      <TextField
        id="healthCheckUrl"
        label={FIELD_LABELS.healthCheckUrl}
        value={values.healthCheckUrl ?? ''}
        onChange={(value) => change('healthCheckUrl', value)}
      />
      <TextField
        id="notes"
        label={FIELD_LABELS.notes}
        value={values.notes ?? ''}
        onChange={(value) => change('notes', value)}
        multiline
      />

      <DomainsField value={values.domains} onChange={(value) => change('domains', value)} />

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
