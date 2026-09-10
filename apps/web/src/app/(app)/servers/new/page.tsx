import { NewServerScreen } from './NewServerScreen';

/** Страница добавления сервера. */
export default function NewServerPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Новый сервер</h1>
      <NewServerScreen />
    </main>
  );
}
