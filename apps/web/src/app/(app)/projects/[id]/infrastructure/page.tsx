import { InfrastructureScreen } from './InfrastructureScreen';

/** Страница секции «Инфраструктура». */
export default async function InfrastructurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Инфраструктура</h1>
      <InfrastructureScreen projectId={id} />
    </main>
  );
}
