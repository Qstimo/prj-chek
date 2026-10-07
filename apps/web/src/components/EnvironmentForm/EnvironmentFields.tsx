'use client';

import { DomainsField } from '../DomainsField';
import { TextField } from '../TextField';
import { DOMAINS_HINT, FIELD_LABELS, HEALTH_CHECK_PATH_HINT } from './constants';
import type { EnvironmentFormValues } from './types';

/** Пропсы полей окружения. */
interface IProps {
  values: EnvironmentFormValues;
  /** Правка одного поля; дженерик сохраняет типизацию значений. */
  onChange: <K extends keyof EnvironmentFormValues>(
    key: K,
    value: EnvironmentFormValues[K],
  ) => void;
  knownDomains?: string[];
}

/** Проверка, заметки и адреса окружения. Вынесены, чтобы форма осталась короткой. */
export function EnvironmentFields({ values, onChange, knownDomains }: IProps) {
  return (
    <>
      <div className="space-y-1">
        <TextField
          id="healthCheckPath"
          label={FIELD_LABELS.healthCheckPath}
          value={values.healthCheckPath ?? ''}
          onChange={(value) => onChange('healthCheckPath', value)}
        />
        <p className="text-xs text-muted-foreground">{HEALTH_CHECK_PATH_HINT}</p>
      </div>

      <TextField
        id="notes"
        label={FIELD_LABELS.notes}
        value={values.notes ?? ''}
        onChange={(value) => onChange('notes', value)}
        multiline
      />

      <div className="space-y-1">
        <DomainsField
          value={values.domains}
          onChange={(value) => onChange('domains', value)}
          knownDomains={knownDomains}
        />
        <p className="text-xs text-muted-foreground">{DOMAINS_HINT}</p>
      </div>
    </>
  );
}
