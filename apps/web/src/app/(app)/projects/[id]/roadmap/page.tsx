import type { CurrentSubjectResponse } from '@cairn/shared';
import { redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';

import { RoadmapScreen } from './RoadmapScreen';

/** Страница секции «Роадмап». */
export default async function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
      <h1 className="text-2xl font-semibold">Роадмап</h1>
      <RoadmapScreen projectId={id} isSuperadmin={subject.isSuperadmin} />
    </main>
  );
}
