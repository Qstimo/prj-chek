import type { ProjectDetail, ProjectMetadata } from '@cairn/shared';
import { notFound, redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { ProjectSections } from '@/components/ProjectSections';

/** Карточка проекта. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let project: ProjectMetadata | ProjectDetail;

  try {
    project = await apiServer<ProjectMetadata | ProjectDetail>(`/projects/${id}`);
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
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ProjectSections project={project} />
    </main>
  );
}
