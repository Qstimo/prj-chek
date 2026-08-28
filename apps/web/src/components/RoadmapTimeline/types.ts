import type { RoadmapProgress, RoadmapVersionState } from '@cairn/shared';

/** Версия на диаграмме: только то, что нужно отметке. */
export interface TimelineVersion {
  id: string;
  label: string;
  state: RoadmapVersionState;
  progress: RoadmapProgress;
}

/** Пропсы диаграммы роадмапа. */
export interface IProps {
  /** Версии по порядку последовательности. */
  versions: TimelineVersion[];
  /** Индекс текущей версии (0-based) либо null. */
  currentIndex: number | null;
}
