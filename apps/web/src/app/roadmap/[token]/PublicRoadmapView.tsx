'use client';

import type { PublicRoadmap } from '@cairn/shared';

import { ReleaseSummary } from '@/components/ReleaseSummary';
import {
  formOf,
  RoadmapTimeline,
  TimelineControls,
  useTimelineView,
} from '@/components/RoadmapTimeline';
import { VersionDrawer } from '@/components/VersionDrawer';

/** Пропсы публичного представления. */
interface IProps {
  roadmap: PublicRoadmap;
}

/**
 * Публичное представление роадмапа: диаграмма и панель просмотра.
 *
 * Переключатель вида здесь тот же, что внутри: место под полосу на
 * публичной странице уже внутреннего экрана (720 px против 976), и именно
 * тут укладка нужнее всего — зашитый порог уводил ленту в прокрутку.
 * Вид и открытая версия живут в адресе: публичной ссылкой делятся, и она
 * обязана открываться тем же видом, каким её прислали.
 */
export function PublicRoadmapView({ roadmap }: IProps) {
  const view = useTimelineView();

  const currentIndex = roadmap.stage.current !== null ? roadmap.stage.current - 1 : null;
  const selectedIndex = roadmap.versions.findIndex((version) => version.id === view.versionId);
  const selected = selectedIndex === -1 ? null : roadmap.versions[selectedIndex]!;
  const form = view.form ?? formOf(roadmap.versions.length);

  return (
    <>
      <ReleaseSummary summary={roadmap.summary} />

      {roadmap.versions.length > 0 && (
        <TimelineControls
          form={form}
          isAll={view.last === null}
          onChangeForm={view.setForm}
          onChangeLast={view.setLast}
        />
      )}

      <RoadmapTimeline
        versions={roadmap.versions}
        currentIndex={currentIndex}
        form={form}
        last={view.last}
        onChangeLast={view.setLast}
        onSelect={view.setVersionId}
      />

      {selected && (
        <VersionDrawer
          key={selected.id}
          platforms={roadmap.summary.map((row) => row.platform)}
          version={selected}
          isCurrent={selectedIndex === currentIndex}
          isOpen
          onClose={() => view.setVersionId(null)}
        />
      )}
    </>
  );
}
