import {
  AccessLevel,
  type ChronicleDetail,
  type ChronicleMetadata,
} from '@cairn/shared';

import { projectByLevel } from '../access/projection';
import type { ChronicleEntry } from '../db/schema';

/**
 * Приводит запись хроники к набору полей, разрешённому уровнем (ТЗ 4.3).
 *
 * Метаданные — «даты и заголовки событий»: дата, заголовок и источник.
 * Содержимое сводки открывается только уровнем чтения.
 */
export function chronicleProjection(
  entry: ChronicleEntry,
  level: AccessLevel,
): ChronicleMetadata | ChronicleDetail {
  return projectByLevel(
    level,
    {
      id: entry.id,
      occurredOn: entry.occurredOn,
      title: entry.title,
      source: entry.source,
    },
    () => ({
      content: entry.content,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    }),
  );
}
