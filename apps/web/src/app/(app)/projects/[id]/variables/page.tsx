import { EnvironmentSwitcher } from './EnvironmentSwitcher';

/** Страница секции «Переменные». */
export default async function VariablesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Переменные</h1>
      <EnvironmentSwitcher projectId={id} />
    </main>
  );
}
