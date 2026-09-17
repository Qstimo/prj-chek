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
 *
 * Ссылки на задачи отключаются отдельным флагом, а не уровнем: публичная
 * страница роадмапа ходит именно под уровнем чтения, и различать пути по
 * уровню значило бы менять его смысл. Умолчание «со ссылками» выбрано
 * осознанно: забыть флаг на внутреннем пути — потерять ссылку, забыть на
 * публичном — раскрыть адрес внутреннего трекера. Публичный путь один.
 */
export function versionProjection(
  version: RoadmapVersionRow,
  checkpoints: RoadmapCheckpointRow[],
  level: AccessLevel,
  withLinks = true,
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
        // Поле добавляется, а не обнуляется: публичная схема строгая,
        // и `url: null` был бы для неё такой же ошибкой, как и адрес.
        ...(withLinks ? { url: checkpoint.url } : {}),
      })),
    }),
  );
}
