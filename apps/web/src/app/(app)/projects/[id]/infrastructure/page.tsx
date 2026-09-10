import type { CurrentSubjectResponse } from '@cairn/shared';
import { redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';

import { InfrastructureScreen } from './InfrastructureScreen';
import { InfrastructureStatusPanel } from './InfrastructureStatusPanel';

/** Страница секции «Инфраструктура». */
export default async function InfrastructurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Инфраструктура</h1>
      <InfrastructureStatusPanel projectId={id} isSuperadmin={subject.isSuperadmin} />
      <InfrastructureScreen projectId={id} isSuperadmin={subject.isSuperadmin} />
    </main>
  );
}
