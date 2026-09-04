import type { RoadmapProgress, RoadmapVersionState } from '@cairn/shared';

/** Версия на диаграмме: только то, что нужно отметке и подписи. */
export interface TimelineVersion {
  id: string;
  label: string;
  state: RoadmapVersionState;
  plannedDate: string | null;
  releasedDate: string | null;
  progress: RoadmapProgress;
}

/** Пропсы диаграммы роадмапа. */
export interface IProps {
  /** Версии по порядку последовательности. */
  versions: TimelineVersion[];
  /** Индекс текущей версии (0-based) либо null. */
  currentIndex: number | null;
  /** Клик по версии. Отсутствие — диаграмма статична. */
  onSelect?: (versionId: string) => void;
}
