import type { RoadmapVersionCreate, RoadmapVersionState } from '@cairn/shared';

/** Значения трёх полей формы релиза. */
export interface IReleaseFormValues {
  label: string;
  state: RoadmapVersionState;
  plannedDate: string;
}

/** Пропсы формы релиза из саммари. */
export interface IProps {
  /**
   * Подсказка обозначения, вычисленная сервером.
   *
   * `null` значит «подставлять нечего»: версий нет, в их обозначениях нет
   * цифр, или у субъекта нет выдачи на роадмап.
   */
  suggestedLabel: string | null;
  /** Сколько задач черновика станут незакрытыми чекпоинтами. */
  taskCount: number;
  /**
   * Тело создания версии: ровно три поля.
   *
   * `releasedDate` здесь не бывает никогда — даже как `null` (дизайн,
   * раздел 7.5).
   */
  onSubmit: (input: RoadmapVersionCreate) => void;
  /** Роадмап проекта опубликован: чекпоинты попадут в публичную выдачу. */
  isRoadmapPublic?: boolean;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
  /** Отказ сервера. */
  error?: string;
}
