'use client';

import type { PublicRoadmap } from '@cairn/shared';
import { useState } from 'react';

import { RoadmapTimeline } from '@/components/RoadmapTimeline';
import { VersionDrawer } from '@/components/VersionDrawer';

/** Пропсы публичного представления. */
interface IProps {
  roadmap: PublicRoadmap;
}

/** Публичное представление роадмапа: диаграмма и панель просмотра. */
export function PublicRoadmapView({ roadmap }: IProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const currentIndex = roadmap.stage.current !== null ? roadmap.stage.current - 1 : null;
  const selectedIndex = roadmap.versions.findIndex((version) => version.id === selectedVersionId);
  const selected = selectedIndex === -1 ? null : roadmap.versions[selectedIndex]!;

  return (
    <>
      <RoadmapTimeline
        versions={roadmap.versions}
        currentIndex={currentIndex}
        onSelect={setSelectedVersionId}
      />

      {selected && (
        <VersionDrawer
          version={selected}
          isCurrent={selectedIndex === currentIndex}
          isOpen
          onClose={() => setSelectedVersionId(null)}
        />
      )}
    </>
  );
}
