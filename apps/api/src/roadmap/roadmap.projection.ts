import {
  AccessLevel,
  type RoadmapVersionDetail,
  type RoadmapVersionMetadata,
} from '@cairn/shared';

import { projectByLevel } from '../access/projection';
import type { RoadmapCheckpointRow, RoadmapVersionRow } from '../db/schema';

/**
 * Приводит версию роадмапа к набору полей по уровню (ТЗ 4.3).
 *
 * Метаданные — «версии и их прогресс»: паспорт версии и числа done/total.
 * Формулировки чекпоинтов открываются уровнем чтения.
 * Прогресс вычисляется здесь и нигде не хранится (ТЗ 3.5).
 */
export function versionProjection(
  version: RoadmapVersionRow,
  checkpoints: RoadmapCheckpointRow[],
  level: AccessLevel,
): RoadmapVersionMetadata | RoadmapVersionDetail {
  return projectByLevel(
    level,
    {
      id: version.id,
      label: version.label,
      state: version.state,
      plannedDate: version.plannedDate,
      releasedDate: version.releasedDate,
      position: version.position,
      progress: {
        done: checkpoints.filter((checkpoint) => checkpoint.isDone).length,
        total: checkpoints.length,
      },
    },
    () => ({
      checkpoints: checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        title: checkpoint.title,
        isDone: checkpoint.isDone,
        position: checkpoint.position,
      })),
    }),
  );
}
