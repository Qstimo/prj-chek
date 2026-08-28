'use client';

import { useState, type FormEvent } from 'react';

import type { IProps } from './types';

/** Форма чекпоинта: одна формулировка — больше у чекпоинта ничего нет (ТЗ 3.5). */
export function CheckpointForm({ initialTitle = '', onSubmit, isSubmitting = false }: IProps) {
  const [title, setTitle] = useState(initialTitle);

  const canSubmit = title.trim().length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({ title: title.trim() });
    setTitle('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1 space-y-1">
        <label htmlFor="checkpoint-title" className="block text-sm font-medium">
          Формулировка
        </label>
        <input
          id="checkpoint-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="self-end rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        Добавить
      </button>
    </form>
  );
}
