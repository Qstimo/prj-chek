import { UsersScreen } from './UsersScreen';

/** Страница управления пользователями. */
export default function UsersPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Пользователи</h1>
      <UsersScreen />
    </main>
  );
}
