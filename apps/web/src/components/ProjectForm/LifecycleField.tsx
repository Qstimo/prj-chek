'use client';

import type { ProjectLifecycle } from '@cairn/shared';

import { FIELD_LABELS, LIFECYCLE_OPTIONS } from './constants';

/** Пропсы поля состояния жизненного цикла. */
interface IProps {
  value: ProjectLifecycle;
  onChange: (value: ProjectLifecycle) => void;
}

/** Выбор состояния жизненного цикла проекта. */
export function LifecycleField({ value, onChange }: IProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="lifecycle" className="block text-sm font-medium">
        {FIELD_LABELS.lifecycle}
      </label>
      <select
        id="lifecycle"
        value={value}
        onChange={(event) => onChange(event.target.value as ProjectLifecycle)}
        className="w-full rounded-md border border-border px-3 py-2"
      >
        {LIFECYCLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
