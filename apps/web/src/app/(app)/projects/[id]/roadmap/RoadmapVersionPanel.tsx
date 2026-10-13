'use client';

import type { Platform, RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

import { describeApiError } from '@/api/errors';
import {
  useMutationCreateCheckpoint,
  useMutationDeleteCheckpoint,
  useMutationDeleteVersion,
  useMutationReadLinkTitle,
  useMutationSaveVersion,
  useMutationUpdateCheckpoint,
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

/**
 * Панель версии на внутреннем экране: собирает мутации в `actions`.
 *
 * Паспорт и выпуски уходят одной мутацией `useMutationSaveVersion`:
 * черновик панели — одна запись, и порядок запросов знает мутация,
 * а не компонент. Чекпоинты остаются мгновенными действиями.
 */
export function RoadmapVersionPanel({
  projectId,
  version,
  isCurrent,
  platforms,
  canWrite,
  onClose,
}: IProps) {
  const saveVersion = useMutationSaveVersion(projectId);
  const deleteVersion = useMutationDeleteVersion(projectId);
  const createCheckpoint = useMutationCreateCheckpoint(projectId);
  const updateCheckpoint = useMutationUpdateCheckpoint(projectId);
  const deleteCheckpoint = useMutationDeleteCheckpoint(projectId);
  const readLinkTitle = useMutationReadLinkTitle(projectId);

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
              onSaveVersion: (patch, ops) =>
                saveVersion.mutate({ versionId: version.id, patch, ops }),
              onDeleteVersion: () => deleteVersion.mutate(version.id, { onSuccess: onClose }),
              isSavingVersion: saveVersion.isPending,
              saveError: describeApiError(saveVersion.error),
              isSubmittingCheckpoint: createCheckpoint.isPending,
            }
          : undefined
      }
    />
  );
}
