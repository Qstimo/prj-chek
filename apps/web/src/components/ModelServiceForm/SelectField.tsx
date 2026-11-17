'use client';

import { Select } from '../Select';
import type { ISelectFieldProps } from './types';

/**
 * Поле выбора с видимой подписью и подсказкой под ним.
 *
 * Общий `Select` подписи не держит — у клеток матриц её нет вовсе, — а в
 * этой форме полей выбора четыре, и повторять обвязку четыре раза значило
 * бы разойтись в ней при первой правке.
 */
export function SelectField({ id, label, value, onChange, options, hint }: ISelectFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Select id={id} value={value} onChange={onChange}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
