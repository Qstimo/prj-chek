'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';

import { FormError } from '../FormError';
import { FIELD_CLASS } from './constants';
import type { IProps } from './types';
import { readLinkTitle } from './utils';

/**
 * Форма чекпоинта: формулировка и указатель на задачу во внешнем трекере.
 * Ссылка — вся прибавка: исполнителей, оценок и дат у чекпоинта нет (ТЗ 1.4).
 */
export function CheckpointForm({
  initialTitle = '',
  onSubmit,
  onReadTitle,
  isSubmitting = false,
  error,
}: IProps) {
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState('');

  const canSubmit = title.trim().length > 0 && !isSubmitting;

  function submit(): void {
    if (!canSubmit) {
      return;
    }

    onSubmit({ title: title.trim(), url: url.trim() || null });
    setTitle('');
    setUrl('');
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

  /** Подставляет заголовок задачи по уходу из поля ссылки. */
  async function handleUrlBlur(): Promise<void> {
    const read = await readLinkTitle({ url, title, onReadTitle });

    if (read) {
      setTitle(read);
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
          className={FIELD_CLASS}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="checkpoint-url" className="block text-sm font-medium">
          Ссылка на задачу
        </label>
        <input
          id="checkpoint-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={handleUrlBlur}
          className={FIELD_CLASS}
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
