import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';

/** Пропсы карточки окружения. */
export interface IProps {
  /** Окружение в той проекции, которую вернул API. */
  environment: EnvironmentMetadata | EnvironmentDetail;
  /** Есть ли право менять секцию. */
  canWrite?: boolean;
  /**
   * Открыты ли этому человеку реестры машин и доменов.
   *
   * От `canWrite` отдельно: писать в окружение вправе подрядчик, а реестр
   * серверов и корневых доменов закрыт правом суперадмина — ссылка в него
   * обещала бы остальным экран, который ответит отказом.
   */
  isSuperadmin?: boolean;
  /** Вызывается при переходе к правке. */
  onEdit?: () => void;
  /** Вызывается после подтверждения удаления. */
  onDelete?: () => void;
}
