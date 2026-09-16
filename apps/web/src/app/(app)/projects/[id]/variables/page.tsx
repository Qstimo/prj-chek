import { EnvironmentSwitcher } from './EnvironmentSwitcher';

/** Страница секции «Переменные». */
export default async function VariablesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="space-y-6 pb-6">
      <h1 className="text-2xl font-semibold">Переменные</h1>
      <EnvironmentSwitcher projectId={id} />
    </main>
  );
}
