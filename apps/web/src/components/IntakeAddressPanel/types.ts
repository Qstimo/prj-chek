import type { IntakeAddress } from '@cairn/shared';

/** Пропсы панели приёмного адреса. */
export interface IProps {
  /** Действующий адрес либо его отсутствие. */
  address: IntakeAddress | null;
  /** Управление адресом — право суперадмина. */
  isSuperadmin: boolean;
  onCreate: () => void;
  onRevoke: () => void;
  /** Действие в процессе. */
  isPending?: boolean;
}
