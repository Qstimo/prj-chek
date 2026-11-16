'use client';

import { useEffect, useRef } from 'react';

import { EDITOR_TEXTS } from './constants';
import type { IRowProps } from './types';

/**
 * Одна строка черновика: формулировка, порядок, удаление.
 *
 * Формулировка живёт в `input` и выводится значением поля, а не
 * разметкой: вывод модели недоверен, и ни Markdown-рендера, ни
 * `dangerouslySetInnerHTML` здесь быть не должно (дизайн, раздел 5.6).
 */
export function TaskRow({
  task,
  isFirst,
  isLast,
  isReadOnly,
  shouldFocus,
  onChange,
  onMove,
  onRemove,
}: IRowProps) {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (shouldFocus) {
      field.current?.focus();
    }
  }, [shouldFocus]);

  return (
    <li className="flex flex-wrap items-center gap-2">
      <input
        ref={field}
        aria-label={EDITOR_TEXTS.titleLabel}
        value={task.title}
        disabled={isReadOnly}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2"
      />

      {task.isFromModel && (
        <span className="shrink-0 text-xs text-muted-foreground">{EDITOR_TEXTS.modelMark}</span>
      )}

      {!isReadOnly && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
          >
            {EDITOR_TEXTS.up}
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
          >
            {EDITOR_TEXTS.down}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-border px-2 py-1 text-xs"
          >
            {EDITOR_TEXTS.remove}
          </button>
        </div>
      )}
    </li>
  );
}
