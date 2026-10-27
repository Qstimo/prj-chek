import type { ProjectListItem, StatusIndicator } from '@cairn/shared';

/** Пропсы строки проекта в сводке. */
export interface IProps {
  project: ProjectListItem;
  /** Вычисленное состояние; отсутствует, если статуса по проекту нет. */
  indicator?: StatusIndicator;
}
