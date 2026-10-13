import {
  AccessLevel,
  Section,
  type CurrentSubjectResponse,
  type Platform,
  type ProjectDetail,
  type ProjectMetadata,
  type SectionLevels,
} from '@cairn/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { ProjectSections } from '@/components/ProjectSections';

import { EditProjectPanel } from './EditProjectPanel';

/**
 * Карточка проекта: паспорт, платформы и правка в выезжающей панели.
 *
 * Уровни доступа запрашиваются и здесь: панели нужно право записи
 * в «Инфо», а клиентский запрос прав заставлял бы кнопку «Править»
 * мигать на время загрузки. Такой же запрос делает каркас, и мемоизация
 * `fetch` внутри одного рендера их склеивает.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let project: ProjectMetadata | ProjectDetail;
  let sections: SectionLevels;
  let subject: CurrentSubjectResponse;

  try {
    [project, sections, subject] = await Promise.all([
      apiServer<ProjectMetadata | ProjectDetail>(`/projects/${id}`),
      apiServer<SectionLevels>(`/projects/${id}/sections`),
      apiServer<CurrentSubjectResponse>('/auth/me'),
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

  // Отказ по уровню — не повод валить страницу: паспорт показывается
  // и без платформ. А вот 401 пробрасывается, иначе редирект на вход
  // потеряется и страница отрисуется пустой.
  const platforms = await apiServer<Platform[]>(`/projects/${id}/platforms`).catch(
    (cause: unknown): Platform[] | undefined => {
      if (cause instanceof ApiError && cause.status === 401) {
        redirect('/login');
      }

      return undefined;
    },
  );

  return (
    <main className="space-y-6 pb-6">
      <ProjectSections project={project} platforms={platforms ?? []} />

      {/* Навигация проекта не трогается: её список — это секции, единицы
          выдачи доступа, а доступы единицей выдачи не являются. */}
      {subject.isSuperadmin && (
        <Link
          href={`/projects/${id}/access`}
          className="inline-block rounded-md border px-3 py-1 text-sm"
        >
          Доступы
        </Link>
      )}

      {/* Панель требует полный паспорт: у проекции метаданных нет полей
          формы, и сузить тип нужно здесь. `notFound()` недопустим —
          паспорт уровня метаданных показывается. */}
      {isDetailed(project) && (
        <EditProjectPanel
          projectId={id}
          canWrite={sections[Section.Info] === AccessLevel.Write}
          initialPlatforms={platforms}
          initial={{
            name: project.name,
            purpose: project.purpose,
            stack: project.stack,
            repoUrl: project.repoUrl,
            notes: project.notes,
            lifecycle: project.lifecycle,
          }}
        />
      )}
    </main>
  );
}

/** Отличает полную проекцию от проекции метаданных. */
function isDetailed(project: ProjectMetadata | ProjectDetail): project is ProjectDetail {
  return 'purpose' in project;
}
