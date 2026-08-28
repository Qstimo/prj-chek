import type { ChronicleDetail, ChronicleMetadata } from '@cairn/shared';

/** Пропсы записи хроники. */
export interface IProps {
  /** Запись в той проекции, которую вернул API. */
  entry: ChronicleMetadata | ChronicleDetail;
  /** Есть ли право менять секцию. */
  canWrite?: boolean;
  /** Вызывается при переходе к правке. */
  onEdit?: () => void;
  /** Вызывается после подтверждения удаления. */
  onDelete?: () => void;
}
