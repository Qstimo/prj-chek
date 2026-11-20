'use client';

import { useEffect, useState } from 'react';

import { ProjectCard } from '../ProjectCard';
import { PROJECT_COLUMNS, ProjectRow } from '../ProjectRow';
import { TagFilterBar } from './TagFilterBar';
import { collectTagFacets, filterByTags } from './tagFilter';
import type { IProps } from './types';
import { useTagSelection } from './useTagSelection';
import {
  DEFAULT_PROJECT_LIST_VIEW,
  readProjectListView,
  writeProjectListView,
  type ProjectListView,
} from './viewStorage';

/** Сводка: все доступные субъекту проекты (спека 9.1). */
export function ProjectList({ projects, createSlot, indicators }: IProps) {
  const { selected, toggle, reset } = useTagSelection();
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

  // Кнопки фильтра — из всей сводки, а отбор — только показанного:
  // иначе выбранный тег убирал бы из полосы сам себя и остальные.
  const facets = collectTagFacets(projects);
  const shown = filterByTags(projects, selected);

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

      <TagFilterBar facets={facets} selected={selected} onToggle={toggle} onReset={reset} />

      {shown.length === 0 ? (
        // Отдельно от пустой системы выше: там нечего показывать, здесь
        // отобрано ничего, и человеку нужно знать, что виноват фильтр.
        <p className="text-muted-foreground">Под выбранные теги не подходит ни один проект.</p>
      ) : view === 'cards' ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} indicator={indicators?.[project.id]} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {/* Доли ширины вместо прежних 64rem: столько не влезало в
              контейнер сводки, и таблица уезжала вправо на любом экране.
              Ширины и видимость колонок заданы в PROJECT_COLUMNS. */}
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs text-muted-foreground">
              <tr>
                {PROJECT_COLUMNS.map((column) => (
                  <th key={column.key} className={`px-3 py-2 font-medium ${column.className}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((project) => (
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
