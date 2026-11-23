'use client';

import { TaskExportOutcome, type TaskExportResult } from '@cairn/shared';

import { EXPORT_TEXTS, type ITaskExportCounts } from './constants';

/**
 * Итог одной выгрузки набора: что случилось с каждой задачей, числами.
 *
 * Читается с ответа ручки, а не с перечитанного реестра, и это главное
 * здесь: сервер отвечает `201` и когда обмен не удался, а при **первом**
 * неудачном обмене строки зеркала не возникает вовсе (контракт,
 * `taskExportResultSchema`). То есть реестр о неудаче не знает ничего, и
 * единственное место, где о ней сказано, — тело ответа. Прежде оно
 * выбрасывалось, отметки снимались, и неудачная выгрузка была неотличима от
 * удачной.
 *
 * Отдельным компонентом рядом с {@link TaskExportCell}: тот отвечает на «что
 * с этой задачей», этот — на «что с набором», и считать исходы в разметке
 * экрана значило бы прятать счёт там, где его не прочитать.
 */
export function TaskExportSummary({ results }: { results: TaskExportResult[] }) {
  const counts = countsOf(results);
  const isTrouble = counts.failed + counts.skipped > 0;

  return (
    <div
      role="status"
      className={`rounded-md border border-border px-3 py-2 text-sm ${
        isTrouble ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      <p>{EXPORT_TEXTS.result(counts)}</p>

      {/* Объяснение стоит только при недошедших задачах: при нуле оно
          рассказывало бы про устройство набора вместо того, что случилось,
          — ровно та подпись «про всё сразу», которую сняли с экрана
          саммари.

          Фраза выбирается по тому, был ли в наборе отказ: `skipped` бывает
          и без единого отказа — набор упёрся в предел времени ответа
          (`EXPORT_BATCH_BUDGET_MS`) или задачу унесли, пока он шёл. Назвать
          тогда причиной отказ значило бы отправить человека проверять токен
          и доску, которые в порядке, — при «не вышло 0» на экране. */}
      {counts.skipped > 0 && (
        <p className="mt-1">
          {counts.failed > 0 ? EXPORT_TEXTS.skippedWhy : EXPORT_TEXTS.skippedWhyBudget}
        </p>
      )}
    </div>
  );
}

/**
 * Счёт по четырём исходам.
 *
 * Пересчитывается по перечню, а не парой «вышло / не вышло»: по четырём
 * исходам человек делает разное (контракт, `TaskExportOutcome`), и
 * сложенные вместе `created` с `updated` не ответили бы на «завелась там
 * новая задача или исправилась прежняя».
 */
function countsOf(results: TaskExportResult[]): ITaskExportCounts {
  return {
    created: results.filter((it) => it.outcome === TaskExportOutcome.Created).length,
    updated: results.filter((it) => it.outcome === TaskExportOutcome.Updated).length,
    failed: results.filter((it) => it.outcome === TaskExportOutcome.Failed).length,
    skipped: results.filter((it) => it.outcome === TaskExportOutcome.Skipped).length,
  };
}
