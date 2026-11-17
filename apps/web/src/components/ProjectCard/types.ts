import type { ProjectListItem, StatusIndicator } from '@cairn/shared';

/** Пропсы карточки проекта в сводке. */
export interface IProps {
  /**
   * Строка сводки, а не проекция метаданных: карточке нужны теги, и
   * приходит она ровно оттуда же, откуда строка — из `/projects`.
   */
  project: ProjectListItem;
  /** Вычисленное состояние; отсутствует, если статуса по проекту нет. */
  indicator?: StatusIndicator;
}
