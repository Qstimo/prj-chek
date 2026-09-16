import type { ProjectDetail, ProjectMetadata, SectionLevels } from '@cairn/shared';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { ProjectNav } from '@/components/ProjectNav';

/**
 * Каркас экранов проекта: крошки и разделы над любым из них.
 *
 * Общий для всех шести секций и карточки проекта, потому что иначе каждая
 * страница оказывалась тупиком — ни проекта, ни выхода наружу, ни перехода
 * в соседний раздел.
 *
 * Название и уровни доступа запрашиваются здесь, а не в каждой странице:
 * состав разделов определяется выдачами, и решать это в одном месте —
 * то же требование, что и проверка прав на выборке (ТЗ 4.1).
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let project: ProjectMetadata | ProjectDetail;
  let sections: SectionLevels;

  try {
    [project, sections] = await Promise.all([
      apiServer<ProjectMetadata | ProjectDetail>(`/projects/${id}`),
      apiServer<SectionLevels>(`/projects/${id}/sections`),
    ]);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      redirect('/login');
    }

    // Закрытый проект неотличим от несуществующего — так и показываем (ТЗ 4.2).
    if (cause instanceof ApiError && cause.status === 404) {
      notFound();
    }

    throw cause;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 pt-6">
      <ProjectNav projectId={id} projectName={project.name} sections={sections} />
      {children}
    </div>
  );
}
