'use client';

import { DocPageForm } from '../DocPageForm';
import type { IProps } from './types';

/**
 * Поднятие записи хроники в страницу документации (ТЗ 3.6).
 *
 * Обычное создание страницы с предзаполнением; запись хроники остаётся
 * на месте — история не переезжает, содержимое поднимается выше.
 */
export function PromoteToDoc({
  entryTitle,
  entryContent,
  onSubmit,
  onCancel,
  isSubmitting = false,
  error,
}: IProps) {
  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-medium">В документацию</h2>
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-1 text-sm">
          Отмена
        </button>
      </header>

      <DocPageForm
        initial={{ title: entryTitle, content: entryContent }}
        isSubmitting={isSubmitting}
        error={error}
        onSubmit={onSubmit}
      />
    </section>
  );
}
