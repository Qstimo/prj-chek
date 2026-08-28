import { DocsScreen } from './DocsScreen';

/** Страница секции «Документация». */
export default async function DocsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Документация</h1>
      <DocsScreen projectId={id} />
    </main>
  );
}
