'use client';

import { useState, type ChangeEvent } from 'react';

import { ConfirmDialog } from '../ConfirmDialog';
import { FormError } from '../FormError';
import { FIELD_LABELS, FORM_TEXTS } from './constants';
import { readTextFile } from './readTextFile';
import type { IFileProps } from './types';

/**
 * Загрузка текстового файла в поле текста.
 *
 * Содержимое уходит в то же правимое поле, что набирают руками: человек
 * обязан видеть и иметь возможность поправить то, что отправляет.
 * Непустое поле заменяется только после подтверждения — заменять молча
 * набранное руками нельзя.
 */
export function TextFileField({ hasText, onText }: IFileProps) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();

  async function pick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Поле сбрасывается сразу: иначе выбор того же файла второй раз не
    // поднимает события, и кнопка выглядела бы мёртвой.
    event.target.value = '';
    setError(undefined);

    if (!file) {
      return;
    }

    try {
      const text = await readTextFile(file);

      if (hasText) {
        setPending(text);

        return;
      }

      onText(text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : FORM_TEXTS.notPlain);
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor="file" className="block text-sm font-medium">
        {FIELD_LABELS.file}
      </label>
      <input
        id="file"
        type="file"
        accept=".txt,.md"
        onChange={(event) => void pick(event)}
        className="block w-full text-sm"
      />
      <p className="text-xs text-muted-foreground">{FORM_TEXTS.fileHint}</p>

      <FormError message={error} />

      {pending !== undefined && (
        <ConfirmDialog
          label={FORM_TEXTS.replaceLabel}
          confirmLabel={FORM_TEXTS.replaceConfirm}
          onConfirm={() => {
            onText(pending);
            setPending(undefined);
          }}
          onCancel={() => setPending(undefined)}
        >
          {FORM_TEXTS.replaceQuestion}
        </ConfirmDialog>
      )}
    </div>
  );
}
