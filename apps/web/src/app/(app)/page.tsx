import type { CurrentSubjectResponse, ProjectMetadata } from '@cairn/shared';
import { redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { ProjectList } from '@/components/ProjectList';

import { SummaryStatus } from './SummaryStatus';

/** Сводка проектов. */
export default async function HomePage() {
  let projects: ProjectMetadata[];
  let subject: CurrentSubjectResponse;

  try {
    [projects, subject] = await Promise.all([
      apiServer<ProjectMetadata[]>('/projects'),
      apiServer<CurrentSubjectResponse>('/auth/me'),
    ]);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      redirect('/login');
    }

    throw cause;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Проекты</h1>
      <SummaryStatus />
      <ProjectList projects={projects} canCreate={subject.isSuperadmin} />
    </main>
  );
}
