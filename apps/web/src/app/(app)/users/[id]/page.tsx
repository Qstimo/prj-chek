import Link from 'next/link';

import { UserScreen } from './UserScreen';

/** Страница учётной записи. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <nav aria-label="Навигация" className="text-sm text-muted-foreground">
        <Link href="/users" className="hover:underline">
          Пользователи
        </Link>
      </nav>

      <UserScreen userId={id} />
    </main>
  );
}
