'use client';

import { useEffect, useState } from 'react';

import { ConfirmDialog } from '../ConfirmDialog';
import { FileField } from '../FileField';
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
 *
 * Файл приходит двумя путями — кнопкой и броском (на поле или на сам
 * экран саммари), — и путь чтения у них один: отказ по расширению и
 * кодировке объясняется одинаково независимо от того, как файл попал в
 * форму.
 */
export function TextFileField({ hasText, onText, droppedFile }: IFileProps) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();

  async function take(file: File): Promise<void> {
    setError(undefined);

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

  // Брошенный на экран файл читается тем же путём, что выбранный: форма
  // открывается с ним уже в руках, и второго нажатия от человека ждать
  // незачем.
  useEffect(() => {
    if (droppedFile !== undefined) {
      void take(droppedFile);
    }
  }, [droppedFile]);

  return (
    <div className="space-y-1">
      <FileField
        id="file"
        label={FIELD_LABELS.file}
        accept=".txt,.md"
        hint={FORM_TEXTS.fileHint}
        onFile={(file) => void take(file)}
      />

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
