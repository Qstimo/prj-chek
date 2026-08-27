import type { AccessLevel, Section } from '@cairn/shared';

/**
 * Изменение ячейки матрицы доступов.
 *
 * Пустой уровень означает отзыв: в модели данных отсутствие доступа
 * выражается отсутствием строки выдачи (спека 4.3).
 */
export interface GrantChange {
  subjectId: string;
  section: Section;
  level: AccessLevel | null;
}
