'use client';

import type { DocPageCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import type { IProps } from './types';

/** Форма страницы документации: заголовок и Markdown-содержимое (ТЗ 3.4). */
export function DocPageForm({ initial, onSubmit, error, isSubmitting = false }: IProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({ title: title.trim(), content } satisfies DocPageCreate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField id="title" label="Заголовок" value={title} onChange={setTitle} />

      <div className="space-y-1">
        <label htmlFor="content" className="block text-sm font-medium">
          Содержимое
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          rows={12}
          className="w-full rounded-md border border-border px-3 py-2 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Поддерживается Markdown: заголовки, списки, код, ссылки, жирный и курсив.
        </p>
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
