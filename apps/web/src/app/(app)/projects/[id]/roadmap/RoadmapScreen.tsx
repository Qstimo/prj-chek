'use client';

import { Loader } from '@/components/Loader';
import { AccessLevel, Section } from '@cairn/shared';
import Link from 'next/link';
import { useState } from 'react';

import { useQueryRoadmap, useQuerySections } from '@/api/hooks';
import { reportHrefOf } from '@/components/ReleaseReport';
import { ReleaseSummary } from '@/components/ReleaseSummary';
import {
  formOf,
  RoadmapTimeline,
  TimelineControls,
  TimelineHrefProvider,
  useTimelineView,
} from '@/components/RoadmapTimeline';

import { CreateVersionPanel } from './CreateVersionPanel';
import { RoadmapPublicLink } from './RoadmapPublicLink';
import { RoadmapVersionPanel } from './RoadmapVersionPanel';

/** Пропсы экрана роадмапа. */
interface IProps {
  projectId: string;
  isSuperadmin: boolean;
}

/**
 * Роадмап проекта: диаграмма, выезжающая панель версии, публичная ссылка.
 *
 * Вид и открытая версия живут в адресе (`?view`, `?last`, `?version`), а не
 * в состоянии экрана: иначе на «покажи, где мы» нечего послать, а у панели
 * версии нет ни ссылки, ни кнопки «назад». Панель создания — наоборот,
 * состояние: ссылаться на пустую форму незачем.
 */
export function RoadmapScreen({ projectId, isSuperadmin }: IProps) {
  const roadmap = useQueryRoadmap(projectId);
  const sections = useQuerySections(projectId);
  const view = useTimelineView();

  const [isCreating, setIsCreating] = useState(false);

  if (roadmap.isPending || sections.isPending) {
    return <Loader size="page" />;
  }

  if (roadmap.isError || sections.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить роадмап.
      </p>
    );
  }

  const platforms = roadmap.data.summary.map((row) => row.platform);
  const level = sections.data[Section.Roadmap];
  const canWrite = level === AccessLevel.Write;
  const canRead = canWrite || level === AccessLevel.Read;
  const currentIndex = roadmap.data.stage.current !== null ? roadmap.data.stage.current - 1 : null;
  // Панель открыта, пока версия есть в данных: удалили в другой вкладке — закрылась.
  const selectedIndex = roadmap.data.versions.findIndex((version) => version.id === view.versionId);
  const selected = selectedIndex === -1 ? null : roadmap.data.versions[selectedIndex]!;
  // Укладка из адреса, а без неё — умолчание по числу версий: ссылка без
  // `?view` обязана открываться так же, как экран без переключений.
  const form = view.form ?? formOf(roadmap.data.versions.length);

  return (
    <div className="space-y-6">
      <ReleaseSummary summary={roadmap.data.summary} />

      {roadmap.data.summary.length === 0 && canWrite && (
        <p className="text-sm text-muted-foreground">
          <Link href={`/projects/${projectId}`} className="underline">
            Платформы задаются в паспорте проекта
          </Link>
        </p>
      )}

      {roadmap.data.versions.length > 0 && (
        <TimelineControls
          form={form}
          isAll={view.last === null}
          onChangeForm={view.setForm}
          onChangeLast={view.setLast}
        />
      )}

      {/*
        Версия на полосе — ссылка на свой отчёт по релизу: Ctrl+клик
        открывает его в новой вкладке, а адрес можно скопировать и
        прислать. Простой щелчок по-прежнему открывает панель версии —
        правка живёт в ней.
      */}
      <TimelineHrefProvider
        hrefOf={(versionId) => reportHrefOf(projectId, versionId)}
      >
        <RoadmapTimeline
          versions={roadmap.data.versions}
          currentIndex={currentIndex}
          form={form}
          last={view.last}
          onChangeLast={view.setLast}
          onSelect={(versionId) => {
            setIsCreating(false);
            view.setVersionId(versionId);
          }}
        />
      </TimelineHrefProvider>

      {canWrite && (
        <button
          type="button"
          onClick={() => {
            view.setVersionId(null);
            setIsCreating(true);
          }}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Добавить версию
        </button>
      )}

      {selected && (
        // `key` версии: черновик панели живёт в её состоянии, и без него
        // правки одной версии переехали бы на следующую открытую.
        <RoadmapVersionPanel
          key={selected.id}
          projectId={projectId}
          version={selected}
          platforms={platforms}
          isCurrent={selectedIndex === currentIndex}
          canWrite={canWrite}
          onClose={() => view.setVersionId(null)}
        />
      )}

      <CreateVersionPanel
        projectId={projectId}
        platforms={platforms}
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
      />

      {canRead && <RoadmapPublicLink projectId={projectId} isSuperadmin={isSuperadmin} />}
    </div>
  );
}
