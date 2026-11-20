'use client';

import type { IProps } from './types';

/** Поле ввода с подписью, связанной с полем по идентификатору. */
export function TextField({
  id,
  label,
  value,
  onChange,
  multiline = false,
  rows = 3,
  type = 'text',
}: IProps) {
  const className =
    'w-full rounded-md border border-border bg-surface px-3 py-2 transition focus:border-border-strong';

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          // Тянуть поле за угол человек вправе: сколько строк ему нужно,
          // знает он, а не мы.
          className={`${className} resize-y`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
    </div>
  );
}
