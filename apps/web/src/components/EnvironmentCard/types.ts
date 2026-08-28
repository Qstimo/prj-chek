import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';

/** Пропсы карточки окружения. */
export interface IProps {
  /** Окружение в той проекции, которую вернул API. */
  environment: EnvironmentMetadata | EnvironmentDetail;
  /** Есть ли право менять секцию. */
  canWrite?: boolean;
  /** Вызывается при переходе к правке. */
  onEdit?: () => void;
  /** Вызывается после подтверждения удаления. */
  onDelete?: () => void;
}
