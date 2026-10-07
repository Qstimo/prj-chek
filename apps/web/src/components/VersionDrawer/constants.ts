import { RoadmapVersionState } from '@cairn/shared';

/**
 * Подпись платформы без собственного состояния.
 *
 * Прочерк, а не слова: платформа идёт вместе с версией, и говорить о ней
 * отдельно нечего — строки выпуска у неё нет. Смысл выбора читается из
 * подписи самого поля («Состояние {платформа}»), а соседние значения
 * показывают, чем состояние выпуска от версии отличается.
 */
export const NO_RELEASE_LABEL = '—';

/** Подписи состояний версии на языке интерфейса. */
export const STATE_LABELS: Record<RoadmapVersionState, string> = {
  [RoadmapVersionState.Planned]: 'Запланирована',
  [RoadmapVersionState.InProgress]: 'В работе',
  [RoadmapVersionState.Released]: 'Выпущена',
};
