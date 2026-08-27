import { NewProjectScreen } from './NewProjectScreen';

/** Страница создания проекта. */
export default function NewProjectPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Новый проект</h1>
      <NewProjectScreen />
    </main>
  );
}
