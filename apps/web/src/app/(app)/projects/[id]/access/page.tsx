import { AccessScreen } from './AccessScreen';

/** Страница управления доступами. */
export default async function AccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="space-y-6 pb-6">
      <h1 className="text-2xl font-semibold">Доступы к проекту</h1>
      <AccessScreen projectId={id} />
    </main>
  );
}
