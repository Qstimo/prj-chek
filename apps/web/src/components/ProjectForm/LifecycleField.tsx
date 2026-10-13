'use client';

import type { ProjectLifecycle } from '@cairn/shared';

import { Select } from '../Select';
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
      <Select
        id="lifecycle"
        value={value}
        onChange={(next) => onChange(next as ProjectLifecycle)}
      >
        {LIFECYCLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
