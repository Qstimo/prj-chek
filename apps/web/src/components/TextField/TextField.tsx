'use client';

import type { IProps } from './types';

/** Поле ввода с подписью, связанной с полем по идентификатору. */
export function TextField({ id, label, value, onChange, multiline = false, type = 'text' }: IProps) {
  const className = 'w-full rounded-md border border-border px-3 py-2';

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          className={className}
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
