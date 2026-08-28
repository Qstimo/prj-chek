import type { RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

/** Пропсы панели «В чекпоинт». */
export interface IProps {
  /** Заголовок записи хроники — предзаполняет формулировку. */
  entryTitle: string;
  /** Версии роадмапа для выбора. */
  versions: (RoadmapVersionMetadata | RoadmapVersionDetail)[];
  onSubmit: (versionId: string, title: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}
