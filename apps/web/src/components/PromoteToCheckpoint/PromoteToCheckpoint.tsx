'use client';

import { useState, type FormEvent } from 'react';

import type { IProps } from './types';

/**
 * Поднятие записи хроники в чекпоинт (ТЗ 3.6): выбор версии
 * и формулировка, предзаполненная заголовком записи. Отправка —
 * обычное создание чекпоинта; связи между секциями не появляется.
 */
export function PromoteToCheckpoint({
  entryTitle,
  versions,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: IProps) {
  const [versionId, setVersionId] = useState(versions[0]?.id ?? '');
  const [title, setTitle] = useState(entryTitle);

  if (versions.length === 0) {
    return (
      <section className="space-y-2 rounded-md border border-border p-4">
        <p className="text-muted-foreground">
          В роадмапе пока нет версий — сначала заведите версию.
        </p>
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-1 text-sm">
          Закрыть
        </button>
      </section>
    );
  }

  const canSubmit = title.trim().length > 0 && versionId.length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (canSubmit) {
      onSubmit(versionId, title.trim());
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border p-4">
      <h2 className="text-lg font-medium">В чекпоинт роадмапа</h2>

      <div className="space-y-1">
        <label htmlFor="promote-version" className="block text-sm font-medium">
          Версия
        </label>
        <select
          id="promote-version"
          value={versionId}
          onChange={(event) => setVersionId(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        >
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="promote-title" className="block text-sm font-medium">
          Формулировка
        </label>
        <input
          id="promote-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Создать чекпоинт
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border px-4 py-2">
          Отмена
        </button>
      </div>
    </form>
  );
}
