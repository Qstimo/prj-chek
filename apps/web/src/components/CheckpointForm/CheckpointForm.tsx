'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';

import { FormError } from '../FormError';
import type { IProps } from './types';

/** Форма чекпоинта: одна формулировка — больше у чекпоинта ничего нет (ТЗ 3.5). */
export function CheckpointForm({
  initialTitle = '',
  onSubmit,
  isSubmitting = false,
  error,
}: IProps) {
  const [title, setTitle] = useState(initialTitle);

  const canSubmit = title.trim().length > 0 && !isSubmitting;

  function submit(): void {
    if (!canSubmit) {
      return;
    }

    onSubmit({ title: title.trim() });
    setTitle('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // С многострочным полем Enter перестаёт отправлять форму, и без этого
    // сочетания клавиатурного пути к кнопке не остаётся вовсе.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="space-y-1">
        <label htmlFor="checkpoint-title" className="block text-sm font-medium">
          Формулировка
        </label>
        <textarea
          id="checkpoint-title"
          rows={7}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-border bg-surface px-3 py-2"
        />
      </div>

      <FormError message={error} />

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        Добавить
      </button>
    </form>
  );
}
