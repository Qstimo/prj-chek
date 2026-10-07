'use client';

import { useState, type FormEvent } from 'react';

import { FormError } from '../FormError';
import { CheckpointFields } from './CheckpointFields';
import { PlatformsToggles } from './PlatformsToggles';
import type { IProps } from './types';
import { readLinkTitle, submitValuesOf } from './utils';

/**
 * Форма чекпоинта: формулировка, указатель на задачу и теги платформ.
 *
 * Работает и на создание, и на правку: у существующего чекпоинта раньше
 * нельзя было поправить ни формулировку, ни ссылку — только закрыть или
 * удалить, и опечатка означала пересоздание записи.
 *
 * Исполнителей, оценок и дат у чекпоинта по-прежнему нет (ТЗ 1.4).
 */
export function CheckpointForm({
  initial,
  submitLabel = 'Добавить',
  onSubmit,
  onReadTitle,
  platforms,
  isSubmitting = false,
  error,
  idPrefix = 'checkpoint',
}: IProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [platformIds, setPlatformIds] = useState<string[]>(initial?.platformIds ?? []);

  const isCreating = initial === undefined;
  const canSubmit = title.trim().length > 0 && !isSubmitting;

  function submit(): void {
    if (!canSubmit) {
      return;
    }

    onSubmit(submitValuesOf({ title, url, platformIds, hasPlatforms: platforms !== undefined }));

    // В режиме правки форму закрывает родитель, и сбрасывать нечего.
    if (isCreating) {
      setTitle('');
      setUrl('');
      setPlatformIds([]);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submit();
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
      <CheckpointFields
        title={title}
        url={url}
        onTitleChange={setTitle}
        onUrlChange={setUrl}
        onSubmitShortcut={submit}
        onUrlBlur={handleUrlBlur}
        idPrefix={idPrefix}
      />

      {platforms && (
        <PlatformsToggles
          platforms={platforms}
          value={platformIds}
          onChange={setPlatformIds}
          idPrefix={idPrefix}
        />
      )}

      <FormError message={error} />

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
