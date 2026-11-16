import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';

/** Пропсы списка окружений. */
export interface IProps {
  environments: (EnvironmentMetadata | EnvironmentDetail)[];
  /** Есть ли право менять секцию. */
  canWrite?: boolean;
  /** Открыты ли этому человеку реестры машин и доменов. */
  isSuperadmin?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}
