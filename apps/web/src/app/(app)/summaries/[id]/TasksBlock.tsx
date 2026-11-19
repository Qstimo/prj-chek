'use client';

import { SummaryTaskState } from '@cairn/shared';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormError } from '@/components/FormError';
import { EDITOR_TEXTS, SummaryTaskEditor, deleteQuestionOf } from '@/components/SummaryTaskEditor';

import { SUMMARY_TEXTS, droppedNoteOf, stampNoteOf, suggesterNoticeOf } from '../constants';
import { ArchivedTasks } from './ArchivedTasks';
import { ReleasedTasks } from './ReleasedTasks';
import type { ITasksProps } from './types';

/**
 * Правая колонка: разбивка, черновик активных задач, архив и уехавшие.
 *
 * Подпись о том, куда уходит текст, стоит **над** кнопкой и постоянно —
 * не всплывает и не скрывается (дизайн, раздел 5.7). Повторная разбивка
 * непустого черновика спрашивает подтверждение: заменять правленный
 * руками список молча нельзя.
 *
 * Три списка, а не один: редактор правит только активные задачи — ровно
 * те, которые видит `PUT …/tasks` (дизайн, 3.4). Сформированный релиз
 * ничего здесь не замораживает: саммари с релизом формирует следующий из
 * того, что осталось (дизайн, 2.4 и 2.5).
 */
export function TasksBlock({
  summary,
  suggester,
  onSuggest,
  isSuggesting,
  suggestError,
  onSave,
  onDirtyChange,
  isSaving,
  saveError,
  onRelease,
  onArchive,
  onRestore,
  onDelete,
  releaseBlockedNote,
  isActing,
  actionError,
}: ITasksProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[]>();

  const active = summary.tasks.filter((task) => task.state === SummaryTaskState.Active);
  const archived = summary.tasks.filter((task) => task.state === SummaryTaskState.Archived);
  const released = summary.tasks.filter((task) => task.state === SummaryTaskState.Released);

  function requestSuggest(): void {
    if (active.length > 0) {
      setIsConfirming(true);

      return;
    }

    onSuggest();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{SUMMARY_TEXTS.tasksHeading}</h2>

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
          {active.length > 0 ? SUMMARY_TEXTS.suggestAgain : SUMMARY_TEXTS.suggest}
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

      <FormError message={actionError} />

      {/* Платформы едут деталью саммари: ни нового запроса, ни нового
          хука — список уже загружен, и гейт у него один и тот же. */}
      <SummaryTaskEditor
        tasks={active}
        platforms={summary.platforms}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
        isSaving={isSaving}
        error={saveError}
        actions={{
          onRelease,
          onArchive,
          onDelete,
          releaseBlockedNote,
          isBusy: isActing,
        }}
      />

      <ArchivedTasks
        tasks={archived}
        onRestore={onRestore}
        onDelete={setPendingDelete}
        isBusy={isActing}
      />

      {/* Подтверждение удаления из архива живёт здесь, а не в самом
          списке: фраза о потере одна на оба пути, и второй её источник
          разошёлся бы с первым. */}
      {pendingDelete !== undefined && (
        <ConfirmDialog
          label={EDITOR_TEXTS.deleteLabel}
          confirmLabel={EDITOR_TEXTS.deleteConfirm}
          onConfirm={() => {
            onDelete(pendingDelete);
            setPendingDelete(undefined);
          }}
          onCancel={() => setPendingDelete(undefined)}
        >
          {deleteQuestionOf(pendingDelete.length)}
        </ConfirmDialog>
      )}

      <ReleasedTasks tasks={released} projectId={summary.projectId} />
    </section>
  );
}
