'use client';

import { AccessLevel, Section } from '@cairn/shared';
import { useState } from 'react';

import { useQueryRoadmap, useQuerySections } from '@/api/hooks';
import { RoadmapTimeline } from '@/components/RoadmapTimeline';

import { CreateVersionPanel } from './CreateVersionPanel';
import { RoadmapPublicLink } from './RoadmapPublicLink';
import { RoadmapVersionPanel } from './RoadmapVersionPanel';

/** Пропсы экрана роадмапа. */
interface IProps {
  projectId: string;
  isSuperadmin: boolean;
}

/** Роадмап проекта: диаграмма, выезжающая панель версии, публичная ссылка. */
export function RoadmapScreen({ projectId, isSuperadmin }: IProps) {
  const roadmap = useQueryRoadmap(projectId);
  const sections = useQuerySections(projectId);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (roadmap.isPending || sections.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (roadmap.isError || sections.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить роадмап.
      </p>
    );
  }

  const level = sections.data[Section.Roadmap];
  const canWrite = level === AccessLevel.Write;
  const canRead = canWrite || level === AccessLevel.Read;
  const currentIndex = roadmap.data.stage.current !== null ? roadmap.data.stage.current - 1 : null;
  // Панель открыта, пока версия есть в данных: удалили в другой вкладке — закрылась.
  const selectedIndex = roadmap.data.versions.findIndex(
    (version) => version.id === selectedVersionId,
  );
  const selected = selectedIndex === -1 ? null : roadmap.data.versions[selectedIndex]!;

  return (
    <div className="space-y-6">
      <RoadmapTimeline
        versions={roadmap.data.versions}
        currentIndex={currentIndex}
        onSelect={(versionId) => {
          setIsCreating(false);
          setSelectedVersionId(versionId);
        }}
      />

      {canWrite && (
        <button
          type="button"
          onClick={() => {
            setSelectedVersionId(null);
            setIsCreating(true);
          }}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Добавить версию
        </button>
      )}

      {selected && (
        <RoadmapVersionPanel
          projectId={projectId}
          version={selected}
          isCurrent={selectedIndex === currentIndex}
          canWrite={canWrite}
          onClose={() => setSelectedVersionId(null)}
        />
      )}

      <CreateVersionPanel
        projectId={projectId}
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
      />

      {canRead && <RoadmapPublicLink projectId={projectId} isSuperadmin={isSuperadmin} />}
    </div>
  );
}
