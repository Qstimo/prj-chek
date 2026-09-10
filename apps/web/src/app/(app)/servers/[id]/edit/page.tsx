import type { ServerDetail } from '@cairn/shared';
import { notFound, redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { EditServerScreen } from './EditServerScreen';

/** Страница правки сервера. */
export default async function EditServerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let server: ServerDetail;

  try {
    server = await apiServer<ServerDetail>(`/servers/${id}`);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      redirect('/login');
    }

    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{server.name}</h1>
      <EditServerScreen server={server} />
    </main>
  );
}
