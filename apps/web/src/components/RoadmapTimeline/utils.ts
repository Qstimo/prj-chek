import { RoadmapVersionState } from '@cairn/shared';

import { formatDate } from '@/utils';

import type { TimelineVersion } from './types';

/** Заполненность отметки: выпущенная всегда полная — выпущена, значит завершена. */
export function fractionOf(version: TimelineVersion): number {
  if (version.state === RoadmapVersionState.Released) {
    return 1;
  }

  if (version.progress.total === 0) {
    return 0;
  }

  return version.progress.done / version.progress.total;
}

/**
 * Подпись даты под названием версии (спека, раздел 2).
 *
 * Выпущенная без даты — пусто: фактическая дата неизвестна, показывать
 * плановую с «ожидается» для случившегося релиза было бы ложью.
 */
export function dateLabelOf(version: TimelineVersion): string {
  if (version.state === RoadmapVersionState.Released) {
    return version.releasedDate ? formatDate(version.releasedDate) : '';
  }

  return version.plannedDate ? `ожидается ${formatDate(version.plannedDate)}` : '';
}
