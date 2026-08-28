import type { PublicRoadmap } from '@cairn/shared';
import { notFound } from 'next/navigation';

import { serverApiUrl } from '@/api/config';
import { RoadmapTimeline } from '@/components/RoadmapTimeline';
import { VersionCard } from '@/components/VersionCard';

/**
 * Публичная страница роадмапа (ТЗ 3.5): чтение по токену без входа.
 *
 * Живёт вне группы `(app)` намеренно: ни навигации приложения,
 * ни редиректов на вход, ни ссылок внутрь системы.
 */
export default async function PublicRoadmapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Запрос без cookie: у публичного читателя нет и не должно быть сессии.
  const response = await fetch(`${serverApiUrl()}/public/roadmap/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    notFound();
  }

  const roadmap = (await response.json()) as PublicRoadmap;
  const noop = () => undefined;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{roadmap.projectName} — роадмап</h1>

      <RoadmapTimeline
        versions={roadmap.versions}
        currentIndex={roadmap.stage.current !== null ? roadmap.stage.current - 1 : null}
      />

      <div className="grid gap-3">
        {roadmap.versions.map((version) => (
          <VersionCard
            key={version.id}
            version={version}
            onToggleCheckpoint={noop}
            onEditVersion={noop}
            onDeleteVersion={noop}
            onDeleteCheckpoint={noop}
            onAddCheckpoint={noop}
          />
        ))}
      </div>
    </main>
  );
}
