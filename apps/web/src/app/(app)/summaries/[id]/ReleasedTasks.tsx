'use client';

import Link from 'next/link';
import { useState } from 'react';

import { releasedHeadingOf, SUMMARY_TEXTS } from '../constants';
import type { IReleasedProps } from './types';

/**
 * Уехавшие задачи: только чтение, с обозначением версии и ссылкой на неё.
 *
 * Обратного перехода из `released` нет ни одного: чекпоинт уже живёт в
 * роадмапе, и «вернуть задачу из релиза» означало бы править роадмап
 * отсюда (дизайн, 3.3). Поэтому здесь нет ни полей, ни кнопок — только
 * дорога туда, где эта задача теперь правится.
 *
 * Обозначение и идентификатор версии выходят по одному правилу
 * видимости, поэтому проверяются вместе: без выдачи на роадмап ссылки
 * нет, и это штатный случай, а не ошибка.
 */
export function ReleasedTasks({ tasks, projectId, onExport }: IReleasedProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm font-medium hover:underline"
      >
        {releasedHeadingOf(tasks.length)}
      </button>

      {/* Список назван для читалок: заголовок-переключатель рядом несёт
          число, а не роль списка, и голосом они различались бы только
          числом. */}
      {isOpen && (
        <ul aria-label={SUMMARY_TEXTS.releasedListLabel} className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3"
            >
              <p className="min-w-0 flex-1 text-sm">{task.title}</p>

              {task.taskId && (
                <Link href={`/projects/${projectId}/tasks`} className="shrink-0 text-xs underline">
                  В задачах проекта
                </Link>
              )}
              {onExport && task.taskId && (
                <button
                  type="button"
                  onClick={() => onExport([task.taskId!])}
                  className="rounded-md border border-border px-2 py-1 text-xs"
                >
                  Выгрузить в Weeek
                </button>
              )}
              {task.releasedVersionId === null && task.taskId ? (
                <span className="text-xs text-muted-foreground">Вне релиза</span>
              ) : task.releasedVersionLabel === null || task.releasedVersionId === null ? (
                <p className="shrink-0 text-xs text-muted-foreground">
                  {SUMMARY_TEXTS.releasedHidden}
                </p>
              ) : (
                <Link
                  href={`/projects/${projectId}/roadmap?version=${task.releasedVersionId}`}
                  className="shrink-0 text-xs hover:underline"
                >
                  {task.releasedVersionLabel}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
