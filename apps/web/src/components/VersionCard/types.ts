import type { RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

/** Пропсы карточки версии. */
export interface IProps {
  /** Версия в той проекции, которую вернул API. */
  version: RoadmapVersionMetadata | RoadmapVersionDetail;
  /** Право менять — уровень записи. */
  canWrite?: boolean;
  onToggleCheckpoint: (checkpointId: string, isDone: boolean) => void;
  onEditVersion: () => void;
  onDeleteVersion: () => void;
  onDeleteCheckpoint: (checkpointId: string) => void;
  onAddCheckpoint: () => void;
}
