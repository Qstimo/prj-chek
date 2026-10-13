import type { RoadmapVersionState } from '@cairn/shared';

/**
 * Поля паспорта версии в черновике.
 *
 * Пустые строки вместо `null`: это то, что умеют поля ввода. Черновик
 * панели версии (`IVersionDraft`) расширяет этот набор клетками выпусков.
 */
export interface IVersionPassportDraft {
  label: string;
  state: RoadmapVersionState;
  plannedDate: string;
  releasedDate: string;
}

/** Пропсы полей версии. */
export interface IProps {
  draft: IVersionPassportDraft;
  onChange: (draft: IVersionPassportDraft) => void;
  /**
   * Есть ли у проекта платформы.
   *
   * При них фактическая дата релиза живёт у выпусков платформ: поле
   * скрывается, иначе вторая правда заводилась бы уже после того, как
   * появилась первая.
   */
  hasPlatforms?: boolean;
}
