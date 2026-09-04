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
  isSubmitting?: boolean;
}
