import type { ProjectMetadata } from '@cairn/shared';

/** Пропсы списка проектов. */
export interface IProps {
  projects: ProjectMetadata[];
  /** Вправе ли субъект заводить проекты (спека 4.4 — только суперадмин). */
  canCreate?: boolean;
}
