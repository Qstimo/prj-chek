import Link from 'next/link';

import { ProjectCard } from '../ProjectCard';
import type { IProps } from './types';

/** Сводка: все доступные субъекту проекты (спека 9.1). */
export function ProjectList({ projects, canCreate = false }: IProps) {
  if (projects.length === 0) {
    // Суперадмину пустая система — не отказ в доступе, а приглашение начать.
    return canCreate ? (
      <div className="space-y-3">
        <p className="text-muted-foreground">Пока нет ни одного проекта.</p>
        <CreateLink />
      </div>
    ) : (
      <p className="text-muted-foreground">
        Пока нет ни одного проекта. Доступ к проектам выдаёт администратор.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {canCreate && <CreateLink />}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <li key={project.id}>
            <ProjectCard project={project} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ссылка на экран создания проекта. */
function CreateLink() {
  return (
    <Link
      href="/projects/new"
      className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
    >
      Создать проект
    </Link>
  );
}
