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
  /**
   * Поднять запись в чекпоинт роадмапа (ТЗ 3.6).
   * Кнопка видна только при переданном обработчике — то есть при
   * праве записи в роадмап.
   */
  onPromote?: () => void;
}
