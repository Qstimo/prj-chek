import type { SectionLevels } from '@cairn/shared';

/** Пропсы навигации по проекту. */
export interface IProps {
  projectId: string;
  /** Название проекта: показывается в крошках и ведёт на его карточку. */
  projectName: string;
  /**
   * Уровни доступа к секциям.
   *
   * Отсутствие ключа означает отсутствие доступа, и такой раздел
   * не показывается вовсе: существование секции не раскрывается (ТЗ 4.2).
   */
  sections: SectionLevels;
}
