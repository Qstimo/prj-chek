import type { CurrentSubjectResponse } from '@cairn/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';

import { UserScreen } from './UserScreen';

/**
 * Страница учётной записи.
 *
 * Действующий субъект запрашивается здесь: карточке нужно знать, своя она
 * или чужая, — смена почты себе завершает собственный вход. Такой же
 * запрос делает каркас, и мемоизация `fetch` внутри одного рендера их
 * склеивает.
 */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
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
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <nav aria-label="Навигация" className="text-sm text-muted-foreground">
        <Link href="/users" className="hover:underline">
          Пользователи
        </Link>
      </nav>

      <UserScreen userId={id} currentSubjectId={subject.id} />
    </main>
  );
}
