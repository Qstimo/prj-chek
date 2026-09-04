'use client';

import { AccessLevel, Section, type RoadmapVersionCreate } from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationCreateCheckpoint,
  useMutationCreateVersion,
  useMutationDeleteCheckpoint,
  useMutationDeleteVersion,
  useMutationPublishRoadmap,
  useMutationUnpublishRoadmap,
  useMutationUpdateCheckpoint,
  useMutationUpdateVersion,
  useQueryPublicLink,
  useQueryRoadmap,
  useQuerySections,
} from '@/api/hooks';
import { CheckpointForm } from '@/components/CheckpointForm';
import { PublicLinkPanel } from '@/components/PublicLinkPanel';
import { RoadmapTimeline } from '@/components/RoadmapTimeline';
import { VersionCard } from '@/components/VersionCard';
import { VersionForm } from '@/components/VersionForm';

/** Пропсы экрана роадмапа. */
interface IProps {
  projectId: string;
  isSuperadmin: boolean;
}

/** Роадмап проекта: диаграмма, версии, публичная ссылка (спека 7). */
export function RoadmapScreen({ projectId, isSuperadmin }: IProps) {
  const roadmap = useQueryRoadmap(projectId);
  const sections = useQuerySections(projectId);
  const publicLink = useQueryPublicLink(projectId);
  const createVersion = useMutationCreateVersion(projectId);
  const updateVersion = useMutationUpdateVersion(projectId);
  const deleteVersion = useMutationDeleteVersion(projectId);
  const createCheckpoint = useMutationCreateCheckpoint(projectId);
  const updateCheckpoint = useMutationUpdateCheckpoint(projectId);
  const deleteCheckpoint = useMutationDeleteCheckpoint(projectId);
  const publish = useMutationPublishRoadmap(projectId);
  const unpublish = useMutationUnpublishRoadmap(projectId);

  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
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
  const editing = roadmap.data.versions.find((version) => version.id === editingVersionId);

  function submitVersion(input: RoadmapVersionCreate): void {
    if (editingVersionId) {
      updateVersion.mutate(
        { versionId: editingVersionId, input },
        { onSuccess: () => setEditingVersionId(null) },
      );

      return;
    }

    createVersion.mutate(input, { onSuccess: () => setIsCreating(false) });
  }

  return (
    <div className="space-y-6">
      <RoadmapTimeline
        versions={roadmap.data.versions}
        currentIndex={roadmap.data.stage.current !== null ? roadmap.data.stage.current - 1 : null}
      />

      {canWrite && !isCreating && !editingVersionId && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Добавить версию
        </button>
      )}

      {(isCreating || editing) && (
        <VersionForm
          initial={
            editing
              ? {
                  label: editing.label,
                  state: editing.state,
                  plannedDate: editing.plannedDate,
                  releasedDate: editing.releasedDate,
                }
              : undefined
          }
          isSubmitting={createVersion.isPending || updateVersion.isPending}
          error={(createVersion.error ?? updateVersion.error)?.message}
          onSubmit={submitVersion}
        />
      )}

      <div className="grid gap-3">
        {roadmap.data.versions.map((version) => (
          <div key={version.id} className="space-y-2">
            <VersionCard
              version={version}
              canWrite={canWrite}
              onToggleCheckpoint={(checkpointId, isDone) =>
                updateCheckpoint.mutate({
                  versionId: version.id,
                  checkpointId,
                  input: { isDone },
                })
              }
              onEditVersion={() => {
                setIsCreating(false);
                setEditingVersionId(version.id);
              }}
              onDeleteVersion={() => deleteVersion.mutate(version.id)}
              onDeleteCheckpoint={(checkpointId) =>
                deleteCheckpoint.mutate({ versionId: version.id, checkpointId })
              }
              onAddCheckpoint={() => setAddingTo(addingTo === version.id ? null : version.id)}
            />
            {addingTo === version.id && (
              <CheckpointForm
                isSubmitting={createCheckpoint.isPending}
                onSubmit={(input) => createCheckpoint.mutate({ versionId: version.id, input })}
              />
            )}
          </div>
        ))}
      </div>

      {canRead && (
        <PublicLinkPanel
          link={publicLink.data ?? null}
          isSuperadmin={isSuperadmin}
          isPending={publish.isPending || unpublish.isPending}
          onPublish={() => publish.mutate()}
          onUnpublish={() => unpublish.mutate()}
        />
      )}
    </div>
  );
}
