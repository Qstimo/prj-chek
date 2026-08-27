import type { ProjectDetail } from '@cairn/shared';
import { notFound, redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { EditProjectScreen } from './EditProjectScreen';

/** Страница правки проекта. */
export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let project: ProjectDetail;

  try {
    project = await apiServer<ProjectDetail>(`/projects/${id}`);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      redirect('/login');
    }

    notFound();
  }

  // Уровень метаданных не даёт полей паспорта — править нечего.
  if (!('purpose' in project)) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Правка проекта</h1>
      <EditProjectScreen
        projectId={id}
        initial={{
          name: project.name,
          purpose: project.purpose,
          stack: project.stack,
          repoUrl: project.repoUrl,
          notes: project.notes,
          lifecycle: project.lifecycle,
        }}
      />
    </main>
  );
}
