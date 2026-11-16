import type { CurrentSubjectResponse } from '@cairn/shared';
import { redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';

import { ReportScreen } from './ReportScreen';

/**
 * Страница отчёта по релизу версии.
 *
 * Лежит внутри роадмапа и под тем же каркасом проекта: отчёт — третья
 * проекция той же секции, а не новый раздел. Список разделов закрыт — он
 * равен единицам выдачи доступа (ТЗ 4.1), и седьмой секции у проекта
 * не появляется.
 */
export default async function ReleaseReportPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id, versionId } = await params;

  let subject: CurrentSubjectResponse;

  try {
    subject = await apiServer<CurrentSubjectResponse>('/auth/me');
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      redirect('/login');
    }

    throw cause;
  }

  return (
    <main className="space-y-6 pb-6">
      <h1 className="text-2xl font-semibold">Отчёт по релизу</h1>
      <ReportScreen projectId={id} versionId={versionId} isSuperadmin={subject.isSuperadmin} />
    </main>
  );
}
