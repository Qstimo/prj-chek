import type { AccessLevel, Section } from '@cairn/shared';

import { apiClient } from './client';

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

/**
 * Отправляет изменение ячейки.
 *
 * Общая для обеих матриц — проектной и людской: отзыв идёт удалением
 * строки, выдача — `PUT`. Две копии этого правила разошлись бы так же,
 * как разошлись бы два пути записи на сервере.
 */
export function sendGrantChange(projectId: string, change: GrantChange): Promise<unknown> {
  const path = `/projects/${projectId}/grants`;
  const body = { subjectId: change.subjectId, section: change.section };

  if (change.level === null) {
    return apiClient(path, { method: 'DELETE', body });
  }

  return apiClient(path, { method: 'PUT', body: { ...body, level: change.level } });
}
