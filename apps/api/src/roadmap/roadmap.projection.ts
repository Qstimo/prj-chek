import {
  AccessLevel,
  PlatformReleaseState,
  type PlatformRelease,
  type RoadmapVersionDetail,
  type RoadmapVersionMetadata,
} from '@cairn/shared';

import { projectByLevel } from '../access/projection';
import type { RoadmapCheckpointRow, RoadmapVersionRow } from '../db/schema';

/** Настройки проекции, которые легко перепутать позициями. */
interface VersionProjectionOptions {
  /**
   * Отдавать ли ссылки на задачи. По умолчанию да.
   *
   * Объектом, а не позиционным аргументом: этот флаг — единственное, что
   * держит адрес внутреннего трекера внутри, и позиционный булев легко
   * уехал бы не туда при следующей правке подписи.
   */
  withLinks?: boolean;
  /** Теги чекпоинтов: идентификатор чекпоинта → платформы. */
  platformsByCheckpoint?: Map<string, string[]>;
}

/**
 * Приводит версию роадмапа к набору полей по уровню (ТЗ 4.3).
 *
 * Метаданные — «версии и их прогресс»: паспорт версии и числа done/total.
 * Формулировки чекпоинтов и выпуски по платформам открываются уровнем
 * чтения. Прогресс вычисляется здесь и нигде не хранится (ТЗ 3.5).
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
  releases: PlatformRelease[],
  level: AccessLevel,
  { withLinks = true, platformsByCheckpoint }: VersionProjectionOptions = {},
): RoadmapVersionMetadata | RoadmapVersionDetail {
  return projectByLevel(
    level,
    {
      id: version.id,
      label: version.label,
      state: version.state,
      plannedDate: version.plannedDate,
      releasedDate: releasedDateOf(version, releases),
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
        // Поле добавляется всегда, в отличие от `url`: публичная схема
        // строгая и теги ждёт.
        platformIds: platformsByCheckpoint?.get(checkpoint.id) ?? [],
        // Поле добавляется, а не обнуляется: публичная схема строгая,
        // и `url: null` был бы для неё такой же ошибкой, как и адрес.
        ...(withLinks ? { url: checkpoint.url } : {}),
      })),
      releases,
    }),
  );
}

/**
 * Фактическая дата версии: самая поздняя дата выпущенных выпусков, иначе
 * хранимая.
 *
 * Выпуски точнее: у версии одна дата, а платформы выходят вразнобой.
 * Хранимая колонка остаётся ответом, пока точнее ответить нечем, — в том
 * числе когда выпуски выпущены, но даты у них не заполнены.
 *
 * Считается в блоке метаданных: публичная схема расширяет метаданные, и
 * вычисление внутри блока чтения отдало бы наружу устаревшую колонку.
 */
function releasedDateOf(version: RoadmapVersionRow, releases: PlatformRelease[]): string | null {
  // Фильтр пустых дат идёт до проверки на пустоту: иначе выпуск
  // «вышла, дата неизвестна» затёр бы хранимую дату на null.
  const dates = releases
    .filter((release) => release.state === PlatformReleaseState.Released)
    .map((release) => release.releasedDate)
    .filter((date): date is string => date !== null);

  // Строки `ГГГГ-ММ-ДД` сравниваются лексикографически верно: нули-
  // заполнители на месте. Не «починить» это на localeCompare.
  return dates.length > 0 ? [...dates].sort().at(-1)! : version.releasedDate;
}
