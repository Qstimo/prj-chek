'use client';

import { useState } from 'react';

import { archivedHeadingOf, SUMMARY_TEXTS } from '../constants';
import type { IArchivedProps } from './types';

/**
 * Отложенные задачи: список под активными, свёрнутый по умолчанию.
 *
 * Свёрнут, потому что это не рабочий список: человек правит активные, а
 * сюда заходит, когда вспомнил про отложенное. Число названо на закрытом
 * заголовке — иначе пришлось бы раскрывать, чтобы узнать, есть ли там
 * что-нибудь.
 *
 * Отметок нет: отметка означает «над этим — следующее действие», а здесь
 * действий два, и оба однострочные (дизайн, 4.4). Пустой список не
 * рисуется вовсе — «Архив (0)» рассказывал бы про отсутствующее.
 */
export function ArchivedTasks({ tasks, onRestore, onDelete, isBusy = false }: IArchivedProps) {
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
        {archivedHeadingOf(tasks.length)}
      </button>

      {isOpen && (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3"
            >
              {/* Текстом, а не полем ввода: архив правится после возврата,
                  и ручка замены черновика его не видит (дизайн, 3.4). */}
              <p className="min-w-0 flex-1 text-sm">{task.title}</p>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onRestore([task.id])}
                  disabled={isBusy}
                  className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-50"
                >
                  {SUMMARY_TEXTS.restore}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete([task.id])}
                  disabled={isBusy}
                  className="rounded-md border border-destructive px-3 py-1 text-xs text-destructive disabled:opacity-50"
                >
                  {SUMMARY_TEXTS.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
