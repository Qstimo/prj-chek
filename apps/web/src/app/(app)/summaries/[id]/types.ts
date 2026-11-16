import type {
  RoadmapVersionCreate,
  SummaryDetail,
  SummaryTasksReplace,
  TaskSuggesterInfo,
} from '@cairn/shared';

/** Пропсы экрана одного саммари. */
export interface IProps {
  summaryId: string;
}

/** Пропсы содержимого экрана, когда проект саммари уже известен. */
export interface IBodyProps {
  projectId: string;
  summaryId: string;
}

/** Пропсы шага «Задачи». */
export interface ITasksProps {
  summary: SummaryDetail;
  /** Настройки предложителя: имя узла и модель для постоянной подписи. */
  suggester: TaskSuggesterInfo;
  onSuggest: () => void;
  isSuggesting: boolean;
  /** Отказ разбивки: объяснение по коду, черновик при этом не тронут. */
  suggestError?: string;
  onSave: (input: SummaryTasksReplace) => void;
  isSaving: boolean;
  saveError?: string;
}

/** Пропсы шага «Релиз». */
export interface IReleaseProps {
  summary: SummaryDetail;
  /** Уровень записи на «Роадмап»: без него шаг показан выключенным. */
  canRelease: boolean;
  /** Роадмап опубликован: чекпоинты попадут в публичную выдачу. */
  isRoadmapPublic: boolean;
  onRelease: (input: RoadmapVersionCreate) => void;
  isReleasing: boolean;
  releaseError?: string;
}
