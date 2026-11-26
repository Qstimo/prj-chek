'use client';

import {
  checkpointUrlSchema,
  MAX_SUMMARY_TASKS,
  SummaryTaskOrigin,
  type Platform,
  type SummaryTask,
} from '@cairn/shared';
import { useEffect, useRef, useState } from 'react';

import { ConfirmDialog } from '../ConfirmDialog';
import { FormError } from '../FormError';
import { TaskRow } from './TaskRow';
import { EDITOR_TEXTS, deleteQuestionOf, selectedNoteOf } from './constants';
import type { IDraftTask, IProps } from './types';

/**
 * Загруженный набор в виде строк черновика.
 *
 * Теги, которых нет в списке платформ, отбрасываются: назвать их
 * редактору нечем, и следующее сохранение их уносит. Единственный способ
 * такой тег получить — запрос в обход интерфейса (дизайн, 5.5), а
 * интерфейс, который штатно показывает «неизвестная платформа», обещал
 * бы, что это нормальный случай.
 */
function draftOf(tasks: SummaryTask[], platforms: Platform[]): IDraftTask[] {
  const known = new Set(platforms.map((platform) => platform.id));

  return tasks.map((task) => ({
    key: task.id,
    id: task.id,
    title: task.title,
    isFromModel: task.origin === SummaryTaskOrigin.Model,
    url: task.url ?? '',
    platformIds: task.platformIds.filter((platformId) => known.has(platformId)),
  }));
}

/**
 * Отпечаток загруженного набора: по нему замечается чужая правка.
 *
 * Два новых поля входят в него: иначе правка ссылки или снятие тега не
 * включали бы кнопку «Сохранить» и терялись бы молча — их же стережёт
 * предупреждение об уходе со страницы.
 */
function signatureOf(tasks: IDraftTask[]): string {
  return JSON.stringify(
    tasks.map((task) => [task.id ?? '', task.title, task.url, task.platformIds]),
  );
}

/**
 * Объяснение негодного адреса либо `undefined` у годного и пустого.
 *
 * Проверка — та же схема контракта, а не свой регексп: второе правило
 * формата разошлось бы с первым, и форма стала бы отвергать то, что
 * сервер принимает, или наоборот. Пустое поле законно — это `null`.
 */
function urlErrorOf(url: string): string | undefined {
  const trimmed = url.trim();

  if (trimmed.length === 0 || checkpointUrlSchema.safeParse(trimmed).success) {
    return undefined;
  }

  return EDITOR_TEXTS.urlInvalid;
}

/**
 * Строка в теле замены: формулировка, ссылка и, у существующей, её `id`.
 *
 * Позиция не отправляется — порядок задаёт порядок массива. Отсутствие
 * `id` и означает «новая, набранная человеком», поэтому ключ не ставится
 * вовсе, а не ставится в `undefined`: строгая схема лишнего ключа не
 * принимает.
 *
 * Набор тегов отправляется **только когда платформы переданы**: пустой
 * массив снял бы теги у проекта, где платформ просто не видно, —
 * отсутствие поля означает «не трогать» (дизайн, 3.3). Та же сборка и тот
 * же довод, что у `submitValuesOf` формы чекпоинта.
 */
function payloadOf(
  { id, title, url, platformIds }: IDraftTask,
  withPlatforms: boolean,
): { id?: string; title: string; url: string | null; platformIds?: string[] } {
  return {
    ...(id === undefined ? {} : { id }),
    title: title.trim(),
    url: url.trim() || null,
    ...(withPlatforms ? { platformIds } : {}),
  };
}

/**
 * Редактор черновика задач: формулировки, порядок, добавление, удаление.
 *
 * Карточки, а не строки с раскрывателем: все поля задачи видны сразу, и
 * состояния «что раскрыто» у редактора больше нет вовсе (дизайн, 4.3).
 * Признака «релиз сформирован» у редактора нет: замораживаются уехавшие
 * задачи своим состоянием, а сюда они не попадают — у них свой список
 * только для чтения (дизайн, 2.5).
 *
 * Правки накапливаются в памяти и уходят одной кнопкой «Сохранить» в
 * прилипшей шапке, как у панели версии: `isDirty` считается сравнением с
 * загруженным набором. Запросы и перехват ухода со страницы живут на
 * экране-контейнере, которому несохранённое сообщается `onDirtyChange`;
 * подтверждение удаления остаётся здесь — число отмеченных знает только
 * редактор, и дорогу к прилипшей полосе диалог обязан держать короткой.
 */
export function SummaryTaskEditor({
  tasks,
  platforms,
  onSave,
  actions,
  onDirtyChange,
  isSaving = false,
  error,
}: IProps) {
  const loaded = draftOf(tasks, platforms);
  const signature = signatureOf(loaded);
  const [state, setState] = useState(() => ({ signature, draft: loaded }));
  const [focusKey, setFocusKey] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const nextKey = useRef(0);

  // Пришёл другой набор (сохранение, новая разбивка, действие над
  // выбором) — черновик берётся от него: держать поверх свежего ответа
  // своё прежнее значило бы показывать то, чего на сервере нет. Отметки
  // уходят вместе с ним: отметка поверх свежего ответа предлагала бы
  // действие над строкой, которой уже нет (дизайн, 4.3).
  if (state.signature !== signature) {
    setState({ signature, draft: loaded });
    setFocusKey(undefined);
    setSelectedIds([]);
    setIsConfirmingDelete(false);
  }

  const { draft } = state;
  const isDirty = signatureOf(draft) !== signature;
  const isComplete = draft.every((task) => task.title.trim().length > 0);
  const hasBadUrl = draft.some((task) => urlErrorOf(task.url) !== undefined);
  const isFull = draft.length >= MAX_SUMMARY_TASKS;

  // Отметки сверяются с черновиком, а не берутся как есть: строка,
  // пропавшая из набора, не должна уехать в ручку действия.
  const selectable = draft.flatMap((task) => (task.id === undefined ? [] : [task.id]));
  const selected = selectable.filter((id) => selectedIds.includes(id));
  const isAllSelected = selectable.length > 0 && selected.length === selectable.length;
  // Несохранённые правки выключают все три: ручки работают с тем, что в
  // базе (дизайн, 4.3). Право на роадмап — только у релиза.
  const canAct = selected.length > 0 && !isDirty && actions?.isBusy !== true;

  // Эффектом, а не из обработчика: сброс черновика свежим ответом идёт
  // при отрисовке, и о нём контейнер обязан узнать так же, как о правке.
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function update(next: IDraftTask[]): void {
    setState({ signature, draft: next });
  }

  function toggle(id: string, isSelected: boolean): void {
    setSelectedIds((current) =>
      isSelected ? [...current, id] : current.filter((chosen) => chosen !== id),
    );
  }

  function move(index: number, step: number): void {
    const next = [...draft];
    const moved = next.splice(index, 1)[0];

    if (moved) {
      next.splice(index + step, 0, moved);
      update(next);
    }
  }

  function add(): void {
    nextKey.current += 1;
    const key = `new-${nextKey.current}`;

    // Без `id` и без метки модели: строку набирает человек.
    update([...draft, { key, title: '', isFromModel: false, url: '', platformIds: [] }]);
    setFocusKey(key);
  }

  return (
    <div className="space-y-3">
      {/* Полоса прилипает к верху колонки: список задач длиннее экрана, а
          действие над выбором нажимают, стоя у той строки, которую
          отметили последней.

          Встаёт под навигацией (`4.25rem`) и под шапкой саммари, высоту
          которой измеряет `SummaryBody` и кладёт в `--summary-header-h`.
          Пока здесь стояло `top-0`, полоса прилипала ровно на место
          навигации и накрывала её собой — вместе с заголовком саммари.
          Запасной ноль — для редактора без такой шапки.

          `z-10` — низ стопки: шапки (`z-30` и `z-20`) закрывают полосу,
          а не она их. */}
      <div className="sticky top-[calc(4.25rem+var(--summary-header-h,0px))] z-10 space-y-2 bg-background py-2">
        <div className="flex flex-wrap items-center gap-3">
          {actions !== undefined && (
            <>
              <button
                type="button"
                onClick={() => setSelectedIds(isAllSelected ? [] : selectable)}
                disabled={selectable.length === 0}
                className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
              >
                {isAllSelected ? EDITOR_TEXTS.selectNone : EDITOR_TEXTS.selectAll}
              </button>

              <p className="text-sm text-muted-foreground">{selectedNoteOf(selected.length)}</p>
            </>
          )}

          <button
            type="button"
            onClick={() =>
              onSave({ tasks: draft.map((task) => payloadOf(task, platforms.length > 0)) })
            }
            disabled={!isDirty || !isComplete || hasBadUrl || draft.length === 0 || isSaving}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {isSaving ? 'Сохранение…' : EDITOR_TEXTS.save}
          </button>

          {actions !== undefined && (
            <>
              {actions.onTransfer && (
                <button
                  type="button"
                  onClick={() => actions.onTransfer?.(selected)}
                  disabled={!canAct || actions.releaseBlockedNote !== undefined}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  Перенести в «Задачи» ({selected.length})
                </button>
              )}
              {actions.onExport && (
                <button
                  type="button"
                  onClick={() => actions.onExport?.(selected)}
                  disabled={
                    !canAct ||
                    actions.releaseBlockedNote !== undefined ||
                    actions.exportBlockedNote !== undefined ||
                    selected.length > 50
                  }
                  className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  Выгрузить в Weeek ({selected.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => actions.onRelease(selected)}
                disabled={!canAct || actions.releaseBlockedNote !== undefined}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {`${EDITOR_TEXTS.releaseSelected} (${selected.length})`}
              </button>

              <button
                type="button"
                onClick={() => actions.onArchive(selected)}
                disabled={!canAct}
                className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
              >
                {`${EDITOR_TEXTS.archiveSelected} (${selected.length})`}
              </button>

              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                disabled={!canAct}
                className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50"
              >
                {`${EDITOR_TEXTS.deleteSelected} (${selected.length})`}
              </button>
            </>
          )}

          {isDirty && (
            <p role="status" className="text-sm text-muted-foreground">
              {EDITOR_TEXTS.dirty}
            </p>
          )}
        </div>

        {/* Две причины называются по-разному и обе здесь: несохранённое
            касается всех трёх действий, право на роадмап — одного. */}
        {isDirty && actions !== undefined && (
          <p className="text-sm text-muted-foreground">{EDITOR_TEXTS.unsavedActions}</p>
        )}

        {actions?.releaseBlockedNote !== undefined && (
          <p className="text-sm text-muted-foreground">{actions.releaseBlockedNote}</p>
        )}

        {isConfirmingDelete && (
          <ConfirmDialog
            label={EDITOR_TEXTS.deleteLabel}
            confirmLabel={EDITOR_TEXTS.deleteConfirm}
            onConfirm={() => {
              setIsConfirmingDelete(false);
              actions?.onDelete(selected);
            }}
            onCancel={() => setIsConfirmingDelete(false)}
          >
            {deleteQuestionOf(selected.length)}
          </ConfirmDialog>
        )}
      </div>

      {/* Постоянная подпись, а не всплывающая: человек обязан видеть, что
          список предложен машиной, до того как нажмёт релиз (ТЗ 5.3). */}
      <p className="text-sm text-muted-foreground">{EDITOR_TEXTS.modelNotice}</p>

      <FormError message={error} />

      {draft.length === 0 ? (
        <p className="text-sm text-muted-foreground">{EDITOR_TEXTS.empty}</p>
      ) : (
        <ul className="space-y-2">
          {draft.map((task, index) => (
            <TaskRow
              key={task.key}
              task={task}
              isFirst={index === 0}
              isLast={index === draft.length - 1}
              isSelected={task.id !== undefined && selected.includes(task.id)}
              onSelect={
                actions === undefined
                  ? undefined
                  : (isSelected) => toggle(task.id ?? '', isSelected)
              }
              shouldFocus={task.key === focusKey}
              platforms={platforms}
              onChange={(title) =>
                update(draft.map((item) => (item.key === task.key ? { ...item, title } : item)))
              }
              onUrlChange={(url) =>
                update(draft.map((item) => (item.key === task.key ? { ...item, url } : item)))
              }
              onPlatformsChange={(platformIds) =>
                update(
                  draft.map((item) => (item.key === task.key ? { ...item, platformIds } : item)),
                )
              }
              urlError={urlErrorOf(task.url)}
              onMove={(step) => move(index, step)}
              onRemove={() => update(draft.filter((item) => item.key !== task.key))}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={isFull}
          className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          {EDITOR_TEXTS.add}
        </button>

        {isFull && <p className="text-sm text-muted-foreground">{EDITOR_TEXTS.limit}</p>}
      </div>
    </div>
  );
}
