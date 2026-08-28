import type { RoadmapCheckpointCreate } from '@cairn/shared';

/** Пропсы формы чекпоинта. */
export interface IProps {
  /** Предзаполнение — например, заголовком записи хроники. */
  initialTitle?: string;
  onSubmit: (input: RoadmapCheckpointCreate) => void;
  isSubmitting?: boolean;
}
