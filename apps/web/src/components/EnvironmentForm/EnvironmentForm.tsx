'use client';

import { useState, type FormEvent } from 'react';

import { FormActions } from '../FormActions';
import { TextField } from '../TextField';
import { FIELD_LABELS } from './constants';
import { EnvironmentFields } from './EnvironmentFields';
import { KindField } from './KindField';
import { PlatformsCheckboxes } from './PlatformsCheckboxes';
import { ServerField } from './ServerField';
import type { EnvironmentFormValues, IProps } from './types';
import { submitValuesOf } from './utils';

/** Форма окружения: создание и правка (ТЗ 3.2). */
export function EnvironmentForm({
  initial,
  onSubmit,
  servers = [],
  canAssignServer = false,
  knownDomains,
  platforms,
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

    onSubmit(submitValuesOf(values, { canAssignServer, hasPlatforms: platforms !== undefined }));
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

      <EnvironmentFields values={values} onChange={change} knownDomains={knownDomains} />

      {platforms && (
        <PlatformsCheckboxes
          platforms={platforms}
          value={values.platformIds}
          onChange={(value) => change('platformIds', value)}
        />
      )}

      <FormActions submitLabel="Сохранить" canSubmit={canSubmit} isSubmitting={isSubmitting} error={error} />
    </form>
  );
}
