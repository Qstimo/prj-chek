'use client';

import type { Platform, RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

import {
  useMutationClearRelease,
  useMutationCreateCheckpoint,
  useMutationDeleteCheckpoint,
  useMutationDeleteVersion,
  useMutationReadLinkTitle,
  useMutationSetRelease,
  useMutationUpdateCheckpoint,
  useMutationUpdateVersion,
} from '@/api/hooks';
import { VersionDrawer } from '@/components/VersionDrawer';

/** Пропсы панели версии на внутреннем экране. */
interface IProps {
  projectId: string;
  version: RoadmapVersionMetadata | RoadmapVersionDetail;
  isCurrent: boolean;
  /** Платформы проекта — из сводки роадмапа. */
  platforms: Platform[];
  canWrite: boolean;
  onClose: () => void;
}

/** Панель версии на внутреннем экране: собирает мутации в `actions`. */
export function RoadmapVersionPanel({
  projectId,
  version,
  isCurrent,
  platforms,
  canWrite,
  onClose,
}: IProps) {
  const updateVersion = useMutationUpdateVersion(projectId);
  const deleteVersion = useMutationDeleteVersion(projectId);
  const createCheckpoint = useMutationCreateCheckpoint(projectId);
  const updateCheckpoint = useMutationUpdateCheckpoint(projectId);
  const deleteCheckpoint = useMutationDeleteCheckpoint(projectId);
  const readLinkTitle = useMutationReadLinkTitle(projectId);
  const setRelease = useMutationSetRelease(projectId);
  const clearRelease = useMutationClearRelease(projectId);

  return (
    <VersionDrawer
      version={version}
      isCurrent={isCurrent}
      platforms={platforms}
      isOpen
      onClose={onClose}
      actions={
        canWrite
          ? {
              onToggleCheckpoint: (checkpointId, isDone) =>
                updateCheckpoint.mutate({ versionId: version.id, checkpointId, input: { isDone } }),
              onAddCheckpoint: (input) =>
                createCheckpoint.mutate({ versionId: version.id, input }),
              onEditCheckpoint: (checkpointId, input) =>
                updateCheckpoint.mutate({ versionId: version.id, checkpointId, input }),
              onReadCheckpointTitle: (url) => readLinkTitle.mutateAsync(url),
              onDeleteCheckpoint: (checkpointId) =>
                deleteCheckpoint.mutate({ versionId: version.id, checkpointId }),
              onSubmitVersion: (input, onSuccess) =>
                updateVersion.mutate({ versionId: version.id, input }, { onSuccess }),
              onDeleteVersion: () => deleteVersion.mutate(version.id, { onSuccess: onClose }),
              onSetRelease: (platformId, input) =>
                setRelease.mutate({ versionId: version.id, platformId, input }),
              onClearRelease: (platformId) =>
                clearRelease.mutate({ versionId: version.id, platformId }),
              isSubmittingVersion: updateVersion.isPending,
              versionError: updateVersion.error?.message,
              isSubmittingCheckpoint: createCheckpoint.isPending,
            }
          : undefined
      }
    />
  );
}
