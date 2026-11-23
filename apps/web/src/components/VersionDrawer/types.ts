import type {
  ProjectTask,
  ProjectTaskUpdate,
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

/**
 * Исход переноса чекпоинта в другую версию.
 *
 * Размеченное объединение, а не исключение: «открытой версии нет» — не
 * ошибка, а вопрос к человеку, и панель обязана отличать его от отказа
 * по существу. Разбор ответа сервера остаётся у того, кто зовёт API:
 * панель о кодах HTTP не знает.
 */
export type CarryOverOutcome =
  | { kind: 'done'; targetLabel: string; versionCreated: boolean }
  | { kind: 'needs-label' }
  | { kind: 'failed'; message: string };

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
  /**
   * Правка формулировки, ссылки и тегов — у **задачи**, не у размещения.
   *
   * Поэтому первый аргумент — `taskId`: формулировка живёт в реестре
   * задач, и у поля одно место записи. Пока она правилась ручкой
   * чекпоинта, одна и та же задача в версии и в реестре могла
   * называться по-разному.
   */
  onEditCheckpoint?: (taskId: string, input: ProjectTaskUpdate) => void;
  /** Чтение заголовка задачи по ссылке: подставляется в пустую формулировку. */
  onReadCheckpointTitle?: (url: string) => Promise<string | null>;
  /**
   * Перенос чекпоинта в другую версию.
   *
   * Обещание, а не «выстрелил и забыл»: по исходу панель либо называет
   * версию-получателя, либо спрашивает обозначение новой и повторяет
   * перенос с ним. Необязательно, как и правка: фабрики действий в тестах
   * не обязаны знать о каждой возможности панели.
   */
  onCarryOverCheckpoint?: (
    checkpointId: string,
    newVersionLabel?: string,
  ) => Promise<CarryOverOutcome>;
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
  /**
   * Задачи реестра вне версий — те, которые можно положить сюда.
   *
   * Отсутствие и пустой список означают одно: брать нечего, и выбора на
   * экране не появляется. Отдельного признака «реестр не прочитался» нет
   * намеренно: панель версии не экран задач, и её работа от реестра не
   * зависит — завести новую задачу можно всегда.
   */
  looseTasks?: ProjectTask[];
  /**
   * Обозначение версии, в которую уедет чекпоинт по умолчанию.
   *
   * Данные, а не действие: кнопка обязана ответить «куда» до нажатия.
   * `null` или отсутствие означает «цель посчитает сервер» — тогда кнопка
   * говорит о следующей версии словами.
   */
  carryOverTargetLabel?: string | null;
  /**
   * Адрес страницы отчёта по релизу этой версии.
   *
   * Снаружи, а не собирается здесь: панель не знает ни проекта, ни того,
   * внутреннее это приложение или публичная страница. Без адреса ссылки
   * нет вовсе — на публичной странице роадмапа внутренних адресов не
   * бывает.
   */
  reportHref?: string;
  isOpen: boolean;
  onClose: () => void;
  actions?: IVersionActions;
}
