import type {
  SummaryDetail,
  SummaryRelease,
  SummaryTask,
  SummaryTasksReplace,
  TaskSuggesterInfo,
} from '@cairn/shared';

import type { IReleaseTargetVersion } from '@/components/SummaryReleaseForm';

/** Пропсы экрана одного саммари. */
export interface IProps {
  summaryId: string;
}

/** Пропсы содержимого экрана, когда проект саммари уже известен. */
export interface IBodyProps {
  projectId: string;
  summaryId: string;
}

/** Пропсы шапки рабочего экрана. */
export interface IHeaderProps {
  projectName: string;
  /** День созвона: шапка показывает его по-русски. */
  occurredOn: string;
  title: string;
  /**
   * Бирки состояния потока, уже собранные и упорядоченные.
   *
   * Строки, а не признаки: состояний четыре, и признак на каждое означал
   * бы четыре условия в разметке вместо одного списка. Решает, что
   * показать, `stateBadgesOf` — там же, где живут сами фразы.
   */
  badges: string[];
  /**
   * Ссылка на сам элемент шапки: её высоту измеряет `SummaryBody`.
   *
   * Заранее эту высоту не сосчитать — заголовок переносится, а бирок
   * может не быть вовсе, — а нижним прилипшим слоям она нужна, чтобы
   * встать под шапкой, а не за ней.
   */
  ref?: React.Ref<HTMLElement>;
}

/** Пропсы правой колонки: задачи, архив и уехавшие. */
export interface ITasksProps {
  summary: SummaryDetail;
  /** Настройки предложителя: имя узла и модель для постоянной подписи. */
  suggester: TaskSuggesterInfo;
  onSuggest: () => void;
  isSuggesting: boolean;
  /** Отказ разбивки: объяснение по коду, черновик при этом не тронут. */
  suggestError?: string;
  onSave: (input: SummaryTasksReplace) => void;
  /** Есть несохранённые правки черновика: о них знает и уход со страницы. */
  onDirtyChange: (isDirty: boolean) => void;
  isSaving: boolean;
  saveError?: string;
  /**
   * Отмеченные уезжают в версию: панель релиза открывает контейнер.
   *
   * Контейнер, а не этот блок: панель живёт рядом с панелью правки
   * текста, и две выезжающие панели в двух местах разошлись бы шириной и
   * поведением закрытия.
   */
  onRelease: (taskIds: string[]) => void;
  onTransfer?: (taskIds: string[]) => void;
  onExport?: (taskIds: string[]) => void;
  onExportTransferred?: (taskIds: string[]) => void;
  exportBlockedNote?: string;
  onArchive: (taskIds: string[]) => void;
  onRestore: (taskIds: string[]) => void;
  onDelete: (taskIds: string[]) => void;
  /**
   * Почему выключен **релиз** — по праву на «Роадмап».
   *
   * Архив, возврат и удаление — та же «Хроника ≥ запись», что правка
   * черновика, и выдача на роадмап их не касается (дизайн, 3.3).
   */
  releaseBlockedNote?: string;
  /** Действие над задачами в полёте: кнопки заняты. */
  isActing: boolean;
  /** Отказ действия над задачами. */
  actionError?: string;
}

/** Пропсы списка отложенных задач. */
export interface IArchivedProps {
  tasks: SummaryTask[];
  /** Оба действия однострочные: набор из одного идентификатора. */
  onRestore: (taskIds: string[]) => void;
  onDelete: (taskIds: string[]) => void;
  isBusy?: boolean;
}

/** Пропсы списка уехавших задач. */
export interface IReleasedProps {
  onExport?: (taskIds: string[]) => void;
  tasks: SummaryTask[];
  /** Проект нужен ссылке на версию: роадмап живёт под проектом. */
  projectId: string;
}

/** Пропсы панели релиза. */
export interface IReleaseDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Подсказка обозначения, вычисленная сервером; `null` — её нет. */
  suggestedLabel: string | null;
  /** Сколько отмеченных задач уедет: число названо до нажатия. */
  taskCount: number;
  /** Версии проекта для цели «существующая версия» (дизайн, 4.5). */
  versions: IReleaseTargetVersion[];
  /** Роадмап опубликован: чекпоинты попадут в публичную выдачу. */
  isRoadmapPublic: boolean;
  onRelease: (target: SummaryRelease['target']) => void;
  isReleasing: boolean;
  releaseError?: string;
}
