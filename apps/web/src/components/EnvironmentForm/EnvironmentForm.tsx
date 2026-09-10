'use client';

import type { EnvironmentCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { DomainsField } from '../DomainsField';
import { TextField } from '../TextField';
import { FIELD_LABELS, HOST_HINT } from './constants';
import { KindField } from './KindField';
import { ServerField } from './ServerField';
import type { EnvironmentFormValues, IProps } from './types';

/** Форма окружения: создание и правка (ТЗ 3.2). */
export function EnvironmentForm({
  initial,
  onSubmit,
  servers = [],
  canAssignServer = false,
  error,
  isSubmitting = false,
}: IProps) {
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
      healthCheckUrl: emptyToNull(values.healthCheckUrl),
      notes: emptyToNull(values.notes),
      domains: values.domains,
      // Привязку принимает только суперадмин: у остальных API ответит 403,
      // и отправлять поле без права выбора незачем.
      ...(canAssignServer ? { serverId: values.serverId } : {}),
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

      <ServerField
        value={values.serverId}
        valueName={values.serverName}
        servers={servers}
        canAssign={canAssignServer}
        onChange={(value) => change('serverId', value)}
      />

      <div className="space-y-1">
        <TextField
          id="host"
          label={FIELD_LABELS.host}
          value={values.host ?? ''}
          onChange={(value) => change('host', value)}
        />
        <p className="text-xs text-muted-foreground">{HOST_HINT}</p>
      </div>

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
