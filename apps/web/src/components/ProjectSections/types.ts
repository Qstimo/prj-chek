import type { Platform, ProjectDetail, ProjectMetadata } from '@cairn/shared';

/** Пропсы секций проекта. */
export interface IProps {
  /** Проект в той проекции, которую вернул API. */
  project: ProjectMetadata | ProjectDetail;
  /**
   * Платформы проекта: каналы поставки из его паспорта.
   *
   * Приходят отдельным запросом, а не внутри проекта: единственный
   * источник — ручка платформ, и дублировать их в проекции проекта
   * значило бы развести два ответа об одном.
   */
  platforms?: Platform[];
}
