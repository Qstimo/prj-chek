'use client';

import {
  CARRY_OVER_NEEDS_LABEL,
  type Platform,
  type RoadmapVersionDetail,
  type RoadmapVersionMetadata,
} from '@cairn/shared';

import { ApiError, describeApiError } from '@/api/errors';
import {
  useMutationCarryOverCheckpoint,
  useMutationCreateCheckpoint,
  useMutationDeleteCheckpoint,
  useMutationDeleteVersion,
  useMutationReadLinkTitle,
  useMutationSaveVersion,
  useMutationUpdateCheckpoint,
  useQueryRoadmap,
} from '@/api/hooks';
import { reportHrefOf } from '@/components/ReleaseReport';
import { carryOverTargetOf, VersionDrawer, type CarryOverOutcome } from '@/components/VersionDrawer';

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
  const carryOverCheckpoint = useMutationCarryOverCheckpoint(projectId);
  /**
   * Роадмап читается здесь же, а не приходит пропом.
   *
   * Ключ кэша тот же, что у экрана, поэтому второго запроса не будет, а
   * пропы панели остаются прежними: имя версии-получателя нужно одной
   * кнопке внутри неё, и тянуть его через экран значило бы менять
   * договор с ним ради подписи.
   */
  const roadmap = useQueryRoadmap(projectId);
  const carryOverTargetLabel = roadmap.data
    ? carryOverTargetOf(roadmap.data.versions, roadmap.data.stage.current, version.id)
    : null;

  /**
   * Перенос чекпоинта: отказ «открытой версии нет» — не ошибка.
   *
   * Разбор ответа живёт здесь, а не в панели: о кодах HTTP знает тот, кто
   * зовёт API. Код сравнивается с константой контракта, а не с текстом
   * сообщения — фразу можно переписать, код нельзя.
   */
  async function carryOver(
    checkpointId: string,
    newVersionLabel?: string,
  ): Promise<CarryOverOutcome> {
    try {
      const result = await carryOverCheckpoint.mutateAsync({
        versionId: version.id,
        checkpointId,
        input: newVersionLabel ? { newVersionLabel } : undefined,
      });

      return {
        kind: 'done',
        targetLabel: result.targetVersion.label,
        versionCreated: result.versionCreated,
      };
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.details as { code?: string } | null)?.code === CARRY_OVER_NEEDS_LABEL
      ) {
        return { kind: 'needs-label' };
      }

      return {
        kind: 'failed',
        message: describeApiError(error) ?? 'Не удалось перенести чекпоинт.',
      };
    }
  }

  return (
    <VersionDrawer
      version={version}
      isCurrent={isCurrent}
      platforms={platforms}
      carryOverTargetLabel={carryOverTargetLabel}
      reportHref={reportHrefOf(projectId, version.id)}
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
              onCarryOverCheckpoint: carryOver,
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
