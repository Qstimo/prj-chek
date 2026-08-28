'use client';

import type { PublicRoadmap } from '@cairn/shared';

import { RoadmapTimeline } from '@/components/RoadmapTimeline';
import { VersionCard } from '@/components/VersionCard';

/** Пропсы публичного представления. */
interface IProps {
  roadmap: PublicRoadmap;
}

/**
 * Публичное представление роадмапа: только чтение.
 *
 * Клиентский компонент, потому что переиспользует карточку версии,
 * а функции-обработчики нельзя передавать с сервера; здесь они — заглушки.
 */
export function PublicRoadmapView({ roadmap }: IProps) {
  const noop = () => undefined;

  return (
    <>
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
    </>
  );
}
