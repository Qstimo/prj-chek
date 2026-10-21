import type { AddressIncidents } from '@cairn/shared';

/** Пропсы истории падений адреса. */
export interface IProps {
  /** Инциденты этого адреса; отсутствие — такой же пустой случай. */
  incidents?: AddressIncidents;
}
