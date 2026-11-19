'use client';

import { MAX_SUMMARY_TASK_TITLE } from '@cairn/shared';
import { useEffect, useRef } from 'react';

import { TaskDetails } from './TaskDetails';
import { EDITOR_TEXTS } from './constants';
import type { IRowProps } from './types';

/**
 * Карточка задачи: формулировка, порядок, удаление, ссылка и теги.
 *
 * Карточка, а не строка таблицы: формулировка многострочная, а рядом с
 * ней набор чипов — такая строка строкой быть перестаёт, и поперечная
 * прокрутка на главном экране работы была бы худшим из решений
 * (дизайн, 4.3). Раскрытия нет: поля видны всегда, и это и есть «сразу
 * всё видно» — прежние «Подробнее» и «Показать у всех» существовали
 * только затем, чтобы достать поля из-под стрелки.
 *
 * Формулировка живёт в поле ввода и выводится значением, а не
 * разметкой: вывод модели недоверен, и ни Markdown-рендера, ни
 * `dangerouslySetInnerHTML` здесь быть не должно (дизайн, раздел 5.6).
 *
 * Предел длины держит само поле: `400` от zod пришёл бы с кодом, которого
 * карта отказов не знает, и человек увидел бы общее сообщение сервера
 * вместо объяснения. Обрезание моделью (`MAX_TASK_TITLE` в разборе
 * ответа) этого не заменяет — руками дописать длиннее можно.
 */
export function TaskRow({
  task,
  isFirst,
  isLast,
  isReadOnly,
  shouldFocus,
  platforms,
  onChange,
  onUrlChange,
  onPlatformsChange,
  urlError,
  onMove,
  onRemove,
}: IRowProps) {
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (shouldFocus) {
      field.current?.focus();
    }
  }, [shouldFocus]);

  return (
    <li className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start gap-2">
        {/* Многострочное: задача созвона в одну строку не укладывается, а
            поле, которое её обрезает, заставляет править текст вслепую. */}
        <textarea
          ref={field}
          aria-label={EDITOR_TEXTS.titleLabel}
          value={task.title}
          rows={2}
          maxLength={MAX_SUMMARY_TASK_TITLE}
          disabled={isReadOnly}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 resize-y rounded-md border border-border bg-surface px-3 py-2"
        />

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
      </div>

      {task.isFromModel && (
        <p className="text-xs text-muted-foreground">{EDITOR_TEXTS.modelMark}</p>
      )}

      <TaskDetails
        task={task}
        platforms={platforms}
        isReadOnly={isReadOnly}
        onUrlChange={onUrlChange}
        onPlatformsChange={onPlatformsChange}
        urlError={urlError}
      />
    </li>
  );
}
