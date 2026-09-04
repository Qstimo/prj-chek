import { RoadmapVersionState } from '@cairn/shared';

/** Подписи состояний версии на языке интерфейса. */
export const STATE_LABELS: Record<RoadmapVersionState, string> = {
  [RoadmapVersionState.Planned]: 'Запланирована',
  [RoadmapVersionState.InProgress]: 'В работе',
  [RoadmapVersionState.Released]: 'Выпущена',
};
