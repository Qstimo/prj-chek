import { notFound } from 'next/navigation';

import { apiServer } from '@/api/server';
import { InviteScreen } from './InviteScreen';

/** Страница установки пароля по ссылке. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    await apiServer<{ kind: string }>(`/invitations/${token}`);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center px-4">
      <div className="w-full space-y-6">
        <h1 className="text-xl font-semibold">Установка пароля</h1>
        <InviteScreen token={token} />
      </div>
    </main>
  );
}
