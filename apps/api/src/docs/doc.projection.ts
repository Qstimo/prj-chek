import { AccessLevel, type DocPageDetail, type DocPageMetadata } from '@cairn/shared';

import { projectByLevel } from '../access/projection';
import type { DocPageRow } from '../db/schema';

/**
 * Приводит страницу к набору полей по уровню (ТЗ 4.3).
 *
 * Метаданные — «список страниц»: заголовок и дата правки.
 * Содержимое открывается уровнем чтения.
 */
export function docPageProjection(
  page: DocPageRow,
  level: AccessLevel,
): DocPageMetadata | DocPageDetail {
  return projectByLevel(
    level,
    {
      id: page.id,
      title: page.title,
      updatedAt: page.updatedAt.toISOString(),
    },
    () => ({
      content: page.content,
      createdAt: page.createdAt.toISOString(),
    }),
  );
}
