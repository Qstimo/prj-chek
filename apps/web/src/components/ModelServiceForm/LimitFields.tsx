'use client';

import type { ModelServicePlacement } from '@cairn/shared';

import { PLACEMENT_OPTIONS } from './constants';
import { SelectField } from './SelectField';
import type { ILimitFieldsProps } from './types';

/**
 * Вид узла, предел ожидания и выключатель.
 *
 * Три поля вместе, потому что отвечают на один вопрос — «как мы с этим
 * узлом обходимся», — а не описывают сам узел. Вид среди них не случайно:
 * он знает только человек, и он же решает, допустим ли `http`.
 */
export function LimitFields({ values, onChange }: ILimitFieldsProps) {
  return (
    <>
      <SelectField
        id="placement"
        label="Вид"
        value={values.placement}
        onChange={(value) => onChange('placement', value as ModelServicePlacement)}
        options={PLACEMENT_OPTIONS}
      />

      <div className="space-y-1">
        <label htmlFor="timeoutSeconds" className="block text-sm font-medium">
          Предел ожидания, с
        </label>
        <input
          id="timeoutSeconds"
          type="number"
          min={1}
          max={600}
          value={values.timeoutSeconds}
          onChange={(event) => onChange('timeoutSeconds', event.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.isEnabled}
          onChange={(event) => onChange('isEnabled', event.target.checked)}
        />
        Включено
      </label>
    </>
  );
}
