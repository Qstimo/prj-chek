import type { DomainDetail } from '@cairn/shared';
import { notFound, redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { EditDomainScreen } from './EditDomainScreen';

/** Страница правки корневого домена. */
export default async function EditDomainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let domain: DomainDetail;

  try {
    domain = await apiServer<DomainDetail>(`/domains/${id}`);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      redirect('/login');
    }

    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{domain.name}</h1>
      <EditDomainScreen domain={domain} />
    </main>
  );
}
