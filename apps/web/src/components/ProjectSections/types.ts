import type { ProjectDetail, ProjectMetadata, SectionLevels } from '@cairn/shared';

/** Пропсы секций проекта. */
export interface IProps {
  /** Проект в той проекции, которую вернул API. */
  project: ProjectMetadata | ProjectDetail;
  /**
   * Уровни текущего субъекта по секциям.
   *
   * Определяют, какие секции показать: недоступные отсутствуют,
   * а не выглядят заблокированными (ТЗ 8).
   */
  sections?: SectionLevels;
}
