'use client';

import { MAX_SUMMARY_TASK_TITLE } from '@cairn/shared';
import { useEffect, useRef } from 'react';

import { TaskDetails } from './TaskDetails';
import { EDITOR_TEXTS } from './constants';
import type { IRowProps } from './types';

/**
 * Одна строка черновика: формулировка, порядок, удаление, раскрытие.
 *
 * Формулировка живёт в `input` и выводится значением поля, а не
 * разметкой: вывод модели недоверен, и ни Markdown-рендера, ни
 * `dangerouslySetInnerHTML` здесь быть не должно (дизайн, раздел 5.6).
 *
 * Предел длины держит само поле: `400` от zod пришёл бы с кодом, которого
 * карта отказов не знает, и человек увидел бы общее сообщение сервера
 * вместо объяснения. Обрезание моделью (`MAX_TASK_TITLE` в разборе
 * ответа) этого не заменяет — руками дописать длиннее можно.
 *
 * Ссылка и теги показываются только раскрытой строкой, но **свёрнутая не
 * скрывает заполненного**: рядом с формулировкой видны имена отмеченных
 * платформ и пометка о наличии ссылки. Поле, которого не видно и о
 * котором ничего не сказано, человек считает пустым.
 */
export function TaskRow({
  task,
  isFirst,
  isLast,
  isReadOnly,
  shouldFocus,
  platforms,
  isOpen,
  onToggle,
  onChange,
  onUrlChange,
  onPlatformsChange,
  urlError,
  onMove,
  onRemove,
}: IRowProps) {
  const field = useRef<HTMLInputElement>(null);
  const tagged = platforms.filter((platform) => task.platformIds.includes(platform.id));

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
        maxLength={MAX_SUMMARY_TASK_TITLE}
        disabled={isReadOnly}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2"
      />

      {task.isFromModel && (
        <span className="shrink-0 text-xs text-muted-foreground">{EDITOR_TEXTS.modelMark}</span>
      )}

      {!isOpen && task.url.trim().length > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">{EDITOR_TEXTS.urlMark}</span>
      )}

      {!isOpen &&
        tagged.map((platform) => (
          <span
            key={platform.id}
            className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs"
          >
            {platform.name}
          </span>
        ))}

      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="shrink-0 rounded-md border border-border px-2 py-1 text-xs"
      >
        {isOpen ? EDITOR_TEXTS.collapse : EDITOR_TEXTS.expand}
      </button>

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

      {isOpen && (
        <TaskDetails
          task={task}
          platforms={platforms}
          isReadOnly={isReadOnly}
          onUrlChange={onUrlChange}
          onPlatformsChange={onPlatformsChange}
          urlError={urlError}
        />
      )}
    </li>
  );
}
