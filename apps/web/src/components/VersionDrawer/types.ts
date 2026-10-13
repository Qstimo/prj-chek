import type {
  Platform,
  PlatformReleaseSet,
  PlatformReleaseState,
  RoadmapCheckpointCreate,
  RoadmapVersionDetail,
  RoadmapVersionMetadata,
  RoadmapVersionState,
  RoadmapVersionUpdate,
} from '@cairn/shared';

/**
 * Клетка выпуска в черновике.
 *
 * Пустые строки вместо `null`: это то, что умеют поля ввода, а в контракт
 * они уходят как `null` при сборке операции.
 */
export interface IReleaseCell {
  state: PlatformReleaseState;
  releasedDate: string;
  buildLabel: string;
}

/**
 * Черновик версии: поля паспорта и клетки выпусков.
 *
 * Чекпоинтов здесь нет намеренно: это отдельные сущности со своим
 * адресом, и они меняются сразу (дизайн, раздел 2).
 */
export interface IVersionDraft {
  label: string;
  state: RoadmapVersionState;
  plannedDate: string;
  releasedDate: string;
  /** Клетка на платформу; `null` — «как у версии». */
  releases: Record<string, IReleaseCell | null>;
}

/** Операция над клеткой выпуска: поставить целиком либо снять. */
export type ReleaseOp =
  | { platformId: string; kind: 'set'; input: PlatformReleaseSet }
  | { platformId: string; kind: 'clear' };

/** Действия уровня записи. Отсутствие блока — панель только на просмотр. */
export interface IVersionActions {
  onToggleCheckpoint: (checkpointId: string, isDone: boolean) => void;
  onAddCheckpoint: (input: RoadmapCheckpointCreate) => void;
  /**
   * Сохранение правки чекпоинта: формулировка, ссылка и теги.
   *
   * Необязательно, как и чтение заголовка по ссылке: фабрики действий
   * в тестах не обязаны знать о каждой возможности панели.
   */
  onEditCheckpoint?: (checkpointId: string, input: RoadmapCheckpointCreate) => void;
  /** Чтение заголовка задачи по ссылке: подставляется в пустую формулировку. */
  onReadCheckpointTitle?: (url: string) => Promise<string | null>;
  onDeleteCheckpoint: (checkpointId: string) => void;
  /**
   * Сохранение черновика: патч версии и операции над клетками выпусков.
   *
   * Одним колбэком, а не тремя: для человека это один щелчок, и порядок
   * запросов — не дело панели. Колбэка успеха нет намеренно: разницу
   * обнуляют перечитанные данные, когда доходят до пропа версии.
   */
  onSaveVersion: (patch: RoadmapVersionUpdate, ops: ReleaseOp[]) => void;
  onDeleteVersion: () => void;
  isSavingVersion: boolean;
  saveError?: string;
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
