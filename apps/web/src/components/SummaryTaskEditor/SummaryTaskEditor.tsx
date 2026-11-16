'use client';

import { SummaryTaskOrigin, type SummaryTask } from '@cairn/shared';
import { useRef, useState } from 'react';

import { FormError } from '../FormError';
import { TaskRow } from './TaskRow';
import { EDITOR_TEXTS } from './constants';
import type { IDraftTask, IProps } from './types';

/** Загруженный набор в виде строк черновика. */
function draftOf(tasks: SummaryTask[]): IDraftTask[] {
  return tasks.map((task) => ({
    key: task.id,
    id: task.id,
    title: task.title,
    isFromModel: task.origin === SummaryTaskOrigin.Model,
  }));
}

/** Отпечаток загруженного набора: по нему замечается чужая правка. */
function signatureOf(tasks: IDraftTask[]): string {
  return JSON.stringify(tasks.map((task) => [task.id ?? '', task.title]));
}

/**
 * Строка в теле замены: формулировка и, у существующей, её `id`.
 *
 * Позиция не отправляется — порядок задаёт порядок массива. Отсутствие
 * `id` и означает «новая, набранная человеком», поэтому ключ не ставится
 * вовсе, а не ставится в `undefined`: строгая схема лишнего ключа не
 * принимает.
 */
function payloadOf({ id, title }: IDraftTask): { id?: string; title: string } {
  return { ...(id === undefined ? {} : { id }), title: title.trim() };
}

/**
 * Редактор черновика задач: формулировки, порядок, добавление, удаление.
 *
 * Правки накапливаются в памяти и уходят одной кнопкой «Сохранить» в
 * прилипшей шапке, как у панели версии: `isDirty` считается сравнением с
 * загруженным набором. Компонент чистый — запросы, подтверждения и
 * перехват уходa со страницы живут на экране-контейнере.
 */
export function SummaryTaskEditor({
  tasks,
  onSave,
  isReleased = false,
  isSaving = false,
  error,
}: IProps) {
  const loaded = draftOf(tasks);
  const signature = signatureOf(loaded);
  const [state, setState] = useState(() => ({ signature, draft: loaded }));
  const [focusKey, setFocusKey] = useState<string>();
  const nextKey = useRef(0);

  // Пришёл другой набор (сохранение, новая разбивка) — черновик берётся
  // от него: держать поверх свежего ответа своё прежнее значило бы
  // показывать то, чего на сервере нет.
  if (state.signature !== signature) {
    setState({ signature, draft: loaded });
    setFocusKey(undefined);
  }

  const { draft } = state;
  const isDirty = signatureOf(draft) !== signature;
  const isComplete = draft.every((task) => task.title.trim().length > 0);

  function update(next: IDraftTask[]): void {
    setState({ signature, draft: next });
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
    update([...draft, { key, title: '', isFromModel: false }]);
    setFocusKey(key);
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-background py-2">
        {!isReleased && (
          <button
            type="button"
            onClick={() => onSave({ tasks: draft.map(payloadOf) })}
            disabled={!isDirty || !isComplete || draft.length === 0 || isSaving}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {isSaving ? 'Сохранение…' : EDITOR_TEXTS.save}
          </button>
        )}

        {isDirty && (
          <p role="status" className="text-sm text-muted-foreground">
            {EDITOR_TEXTS.dirty}
          </p>
        )}
      </div>

      {/* Постоянная подпись, а не всплывающая: человек обязан видеть, что
          список предложен машиной, до того как нажмёт релиз (ТЗ 5.3). */}
      {!isReleased && <p className="text-sm text-muted-foreground">{EDITOR_TEXTS.modelNotice}</p>}

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
              isReadOnly={isReleased}
              shouldFocus={task.key === focusKey}
              onChange={(title) =>
                update(draft.map((item) => (item.key === task.key ? { ...item, title } : item)))
              }
              onMove={(step) => move(index, step)}
              onRemove={() => update(draft.filter((item) => item.key !== task.key))}
            />
          ))}
        </ul>
      )}

      {!isReleased && (
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          {EDITOR_TEXTS.add}
        </button>
      )}
    </div>
  );
}
