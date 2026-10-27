'use client';

import { useEffect, useState } from 'react';

import { ProjectCard } from '../ProjectCard';
import { ProjectRow } from '../ProjectRow';
import type { IProps } from './types';
import {
  DEFAULT_PROJECT_LIST_VIEW,
  readProjectListView,
  writeProjectListView,
  type ProjectListView,
} from './viewStorage';

/** Сводка: все доступные субъекту проекты (спека 9.1). */
export function ProjectList({ projects, createSlot, indicators }: IProps) {
  // Дефолт — строки; localStorage читаем после mount, чтобы не мигать
  // cards→rows при гидратации (дизайн компактного реестра §6).
  const [view, setView] = useState<ProjectListView>(DEFAULT_PROJECT_LIST_VIEW);

  useEffect(() => {
    setView(readProjectListView());
  }, []);

  function chooseView(next: ProjectListView): void {
    setView(next);
    writeProjectListView(next);
  }

  if (projects.length === 0) {
    // Суперадмину пустая система — не отказ в доступе, а приглашение начать.
    return createSlot ? (
      <div className="space-y-3">
        <p className="text-muted-foreground">Пока нет ни одного проекта.</p>
        {createSlot}
      </div>
    ) : (
      <p className="text-muted-foreground">
        Пока нет ни одного проекта. Доступ к проектам выдаёт администратор.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {createSlot ?? <span />}
        <div
          className="inline-flex rounded-md border border-border p-0.5"
          role="group"
          aria-label="Вид списка"
        >
          <button
            type="button"
            aria-pressed={view === 'rows'}
            className={toggleClass(view === 'rows')}
            onClick={() => chooseView('rows')}
          >
            Строки
          </button>
          <button
            type="button"
            aria-pressed={view === 'cards'}
            className={toggleClass(view === 'cards')}
            onClick={() => chooseView('cards')}
          >
            Карточки
          </button>
        </div>
      </div>

      {view === 'cards' ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} indicator={indicators?.[project.id]} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Название</th>
                <th className="px-3 py-2 font-medium">Состояние</th>
                <th className="px-3 py-2 font-medium">Платформы</th>
                <th className="px-3 py-2 font-medium">Домен</th>
                <th className="px-3 py-2 font-medium">Сервер</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Обновлён</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  indicator={indicators?.[project.id]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function toggleClass(active: boolean): string {
  return [
    'rounded px-2.5 py-1 text-sm transition',
    active ? 'bg-surface-strong font-medium' : 'text-muted-foreground hover:text-foreground',
  ].join(' ');
}
