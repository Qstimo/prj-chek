import type { ProjectMetadata, StatusIndicator } from '@cairn/shared';

/** Пропсы списка проектов. */
export interface IProps {
  projects: ProjectMetadata[];
  /** Вправе ли субъект заводить проекты (спека 4.4 — только суперадмин). */
  canCreate?: boolean;
  /** Индикатор по идентификатору проекта; отсутствие означает «статуса нет». */
  indicators?: Record<string, StatusIndicator>;
}
