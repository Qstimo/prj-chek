'use client';

import { useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormError } from '@/components/FormError';
import { SummaryTaskEditor } from '@/components/SummaryTaskEditor';

import { SUMMARY_TEXTS, droppedNoteOf, stampNoteOf, suggesterNoticeOf } from '../constants';
import type { ITasksProps } from './types';

/**
 * Шаг «Задачи»: разбивка текста и правка черновика.
 *
 * Подпись о том, куда уходит текст, стоит **над** кнопкой и постоянно —
 * не всплывает и не скрывается (дизайн, раздел 5.7). Повторная разбивка
 * непустого черновика спрашивает подтверждение: заменять правленный
 * руками список молча нельзя.
 */
export function TasksBlock({
  summary,
  suggester,
  onSuggest,
  isSuggesting,
  suggestError,
  onSave,
  isSaving,
  saveError,
}: ITasksProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  function requestSuggest(): void {
    if (summary.tasks.length > 0) {
      setIsConfirming(true);

      return;
    }

    onSuggest();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{SUMMARY_TEXTS.tasksHeading}</h2>

      {!summary.isReleased && (
        <>
          {/* Постоянная подпись: говорит правду до нажатия и заменяет
              диалог подтверждения на каждый вызов. */}
          <p className="rounded-md border border-border bg-surface p-3 text-sm">
            {suggesterNoticeOf(suggester)}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={requestSuggest}
              disabled={!suggester.isEnabled || isSuggesting}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {summary.tasks.length > 0 ? SUMMARY_TEXTS.suggestAgain : SUMMARY_TEXTS.suggest}
            </button>

            {isSuggesting && (
              <p role="status" className="text-sm text-muted-foreground">
                {SUMMARY_TEXTS.suggesting}
              </p>
            )}
          </div>

          <FormError message={suggestError} />

          {isConfirming && (
            <ConfirmDialog
              label={SUMMARY_TEXTS.replaceLabel}
              confirmLabel={SUMMARY_TEXTS.replaceConfirm}
              onConfirm={() => {
                setIsConfirming(false);
                onSuggest();
              }}
              onCancel={() => setIsConfirming(false)}
            >
              {SUMMARY_TEXTS.replaceQuestion}
            </ConfirmDialog>
          )}
        </>
      )}

      {summary.suggester && (
        <p className="text-sm text-muted-foreground">
          {stampNoteOf(summary.suggester.model, summary.suggester.at)}
        </p>
      )}

      {/* Ноль не показывается, `null` — тем более: у прежних разбивок
          число не сохранено, и показать его значило бы утверждать. */}
      {summary.suggester !== null && (summary.suggester.dropped ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          {droppedNoteOf(summary.suggester.dropped ?? 0)}
        </p>
      )}

      {/* Предупреждение, а не запрет: релиз не блокируется (раздел 2.5). */}
      {summary.isTextStale && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          {SUMMARY_TEXTS.stale}
        </p>
      )}

      <SummaryTaskEditor
        tasks={summary.tasks}
        onSave={onSave}
        isReleased={summary.isReleased}
        isSaving={isSaving}
        error={saveError}
      />
    </section>
  );
}
