'use client';

import { EnvironmentKind } from '@cairn/shared';

import { KIND_LABELS } from '../EnvironmentCard/constants';
import { FIELD_LABELS } from './constants';

/** Пропсы поля вида окружения. */
interface IProps {
  value: EnvironmentKind;
  onChange: (value: EnvironmentKind) => void;
}

/** Выбор вида окружения. */
export function KindField({ value, onChange }: IProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="kind" className="block text-sm font-medium">
        {FIELD_LABELS.kind}
      </label>
      <select
        id="kind"
        value={value}
        onChange={(event) => onChange(event.target.value as EnvironmentKind)}
        className="w-full rounded-md border border-border px-3 py-2"
      >
        {Object.values(EnvironmentKind).map((kind) => (
          <option key={kind} value={kind}>
            {KIND_LABELS[kind]}
          </option>
        ))}
      </select>
    </div>
  );
}
