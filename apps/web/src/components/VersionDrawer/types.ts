import type {
  Platform,
  PlatformReleaseSet,
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
  /**
   * Постановка выпуска платформы. Отправляется вся тройка: `PUT`
   * заменяет клетку целиком.
   */
  onSetRelease?: (platformId: string, input: PlatformReleaseSet) => void;
  /** Снятие выпуска: платформа снова идёт «как у версии». */
  onClearRelease?: (platformId: string) => void;
  isSubmittingVersion: boolean;
  versionError?: string;
  isSubmittingCheckpoint: boolean;
}

/** Пропсы панели версии. */
export interface IProps {
  /** Версия в той проекции, которую вернул API. */
  version: RoadmapVersionMetadata | RoadmapVersionDetail;
  isCurrent: boolean;
  /**
   * Платформы проекта — из сводки роадмапа.
   *
   * Оттуда, а не отдельным запросом: сводка приходит вместе с роадмапом
   * и не требует доступа к «Инфо».
   */
  platforms?: Platform[];
  isOpen: boolean;
  onClose: () => void;
  actions?: IVersionActions;
}
