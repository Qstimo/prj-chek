import type { ProjectDetail, ProjectMetadata } from '@cairn/shared';

/** Пропсы секций проекта. */
export interface IProps {
  /** Проект в той проекции, которую вернул API. */
  project: ProjectMetadata | ProjectDetail;
}
