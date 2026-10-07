import { ProjectCard } from '../ProjectCard';
import type { IProps } from './types';

/** Сводка: все доступные субъекту проекты (спека 9.1). */
export function ProjectList({ projects, createSlot, indicators }: IProps) {
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
      {createSlot}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <li key={project.id}>
            <ProjectCard project={project} indicator={indicators?.[project.id]} />
          </li>
        ))}
      </ul>
    </div>
  );
}
