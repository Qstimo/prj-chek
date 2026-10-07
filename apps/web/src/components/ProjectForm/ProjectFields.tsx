'use client';

import { TextField } from '../TextField';
import { FIELD_LABELS } from './constants';
import { LifecycleField } from './LifecycleField';
import type { ProjectFormValues } from './types';

/** Пропсы полей паспорта. */
interface IProps {
  values: ProjectFormValues;
  /**
   * Правка одного поля.
   *
   * Дженерик обязателен: сведение к `(key: string, value: unknown)`
   * потеряло бы типизацию полей, а `any` в проекте запрещён.
   */
  onChange: <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => void;
}

/** Поля паспорта проекта. Вынесены из формы, чтобы та осталась короткой. */
export function ProjectFields({ values, onChange }: IProps) {
  return (
    <>
      <TextField
        id="name"
        label={FIELD_LABELS.name}
        value={values.name}
        onChange={(value) => onChange('name', value)}
      />
      <TextField
        id="purpose"
        label={FIELD_LABELS.purpose}
        value={values.purpose ?? ''}
        onChange={(value) => onChange('purpose', value)}
        multiline
      />
      <TextField
        id="stack"
        label={FIELD_LABELS.stack}
        value={values.stack ?? ''}
        onChange={(value) => onChange('stack', value)}
      />
      <TextField
        id="repoUrl"
        label={FIELD_LABELS.repoUrl}
        value={values.repoUrl ?? ''}
        onChange={(value) => onChange('repoUrl', value)}
      />
      <TextField
        id="notes"
        label={FIELD_LABELS.notes}
        value={values.notes ?? ''}
        onChange={(value) => onChange('notes', value)}
        multiline
      />

      <LifecycleField value={values.lifecycle} onChange={(value) => onChange('lifecycle', value)} />
    </>
  );
}
