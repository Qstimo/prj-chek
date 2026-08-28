'use client';

import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import type { IProps } from './types';

/**
 * Форма переменной (ТЗ 3.3).
 *
 * При правке пустое значение означает «не менять», а не «стереть»:
 * иначе правка описания затирала бы секрет.
 */
export function VariableForm({
  initial,
  isEditing = false,
  onSubmit,
  error,
  isSubmitting = false,
}: IProps) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [value, setValue] = useState('');

  const canSubmit =
    key.trim().length > 0 && (isEditing || value.length > 0) && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const base = {
      key: key.trim(),
      description: description.trim().length > 0 ? description.trim() : null,
    };

    onSubmit(isEditing && value.length === 0 ? base : { ...base, value });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField id="key" label="Ключ" value={key} onChange={setKey} />
      <TextField id="description" label="Описание" value={description} onChange={setDescription} />

      <div className="space-y-1">
        <label htmlFor="value" className="block text-sm font-medium">
          Значение
        </label>
        <textarea
          id="value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={isEditing ? 'Оставьте пустым, чтобы не менять' : ''}
          className="w-full rounded-md border border-border px-3 py-2 font-mono"
          rows={3}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  );
}
