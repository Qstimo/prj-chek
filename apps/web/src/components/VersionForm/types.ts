import type { RoadmapVersionCreate, RoadmapVersionState } from '@cairn/shared';

/** Начальные значения формы версии. */
export interface VersionFormInitial {
  label: string;
  state: RoadmapVersionState;
  plannedDate: string | null;
  releasedDate: string | null;
}

/** Пропсы формы версии. */
export interface IProps {
  /** Начальные значения. Отсутствие — форма создания. */
  initial?: VersionFormInitial;
  onSubmit: (input: RoadmapVersionCreate) => void;
  error?: string;
  /**
   * Возврат из правки без сохранения.
   *
   * Отсутствие означает, что возвращаться некуда: форма создания
   * закрывается самой панелью.
   */
  onCancel?: () => void;
  isSubmitting?: boolean;
  /**
   * Есть ли у проекта платформы.
   *
   * При них фактическая дата релиза живёт у выпусков платформ: поле
   * скрывается и ключ не отправляется, иначе вторая правда заводилась бы
   * уже после того, как появилась первая.
   */
  hasPlatforms?: boolean;
}
