import type { CurrentSubjectResponse, ProjectMetadata, StatusSummaryRow } from '@cairn/shared';
import { redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { ProjectList } from '@/components/ProjectList';
import { WarningsPanel, WarningTone } from '@/components/WarningsPanel';
import { splitWarningsByUrgency } from '@/utils';

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

  // Отдельно от запросов выше намеренно: ошибка статусов не должна уводить
  // сводку в ошибку — список проектов важнее индикаторов.
  const summary = await apiServer<StatusSummaryRow[]>('/status/summary').catch(
    (): StatusSummaryRow[] => [],
  );

  const { critical, attention } = splitWarningsByUrgency(summary);
  const indicators = Object.fromEntries(summary.map((row) => [row.projectId, row.indicator]));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Проекты</h1>

      <WarningsPanel title="Не отвечает" tone={WarningTone.Critical} warnings={critical} />
      <WarningsPanel title="Требует внимания" warnings={attention} />

      <ProjectList
        projects={projects}
        indicators={indicators}
        canCreate={subject.isSuperadmin}
      />
    </main>
  );
}
