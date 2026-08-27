import { ProjectCard } from '../ProjectCard';
import type { IProps } from './types';

/** Сводка: все доступные субъекту проекты (спека 9.1). */
export function ProjectList({ projects }: IProps) {
  if (projects.length === 0) {
    return (
      <p className="text-muted-foreground">
        Пока нет ни одного проекта. Доступ к проектам выдаёт администратор.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectCard project={project} />
        </li>
      ))}
    </ul>
  );
}
