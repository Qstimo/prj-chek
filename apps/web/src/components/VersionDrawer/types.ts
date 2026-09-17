import type {
  RoadmapCheckpointCreate,
  RoadmapVersionCreate,
  RoadmapVersionDetail,
  RoadmapVersionMetadata,
} from '@cairn/shared';

/** Действия уровня записи. Отсутствие блока — панель только на просмотр. */
export interface IVersionActions {
  onToggleCheckpoint: (checkpointId: string, isDone: boolean) => void;
  onAddCheckpoint: (input: RoadmapCheckpointCreate) => void;
  /** Чтение заголовка задачи по ссылке: подставляется в пустую формулировку. */
  onReadCheckpointTitle?: (url: string) => Promise<string | null>;
  onDeleteCheckpoint: (checkpointId: string) => void;
  /** Сохранение полей версии; `onSuccess` возвращает панель в просмотр. */
  onSubmitVersion: (input: RoadmapVersionCreate, onSuccess: () => void) => void;
  onDeleteVersion: () => void;
  isSubmittingVersion: boolean;
  versionError?: string;
  isSubmittingCheckpoint: boolean;
}

/** Пропсы панели версии. */
export interface IProps {
  /** Версия в той проекции, которую вернул API. */
  version: RoadmapVersionMetadata | RoadmapVersionDetail;
  isCurrent: boolean;
  isOpen: boolean;
  onClose: () => void;
  actions?: IVersionActions;
}
