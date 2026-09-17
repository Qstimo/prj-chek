import type { ProjectMetadata, StatusIndicator } from '@cairn/shared';

/** Пропсы карточки проекта в сводке. */
export interface IProps {
  project: ProjectMetadata;
  /** Вычисленное состояние; отсутствует, если статуса по проекту нет. */
  indicator?: StatusIndicator;
}
