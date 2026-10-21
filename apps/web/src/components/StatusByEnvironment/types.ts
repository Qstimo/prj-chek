import type { AddressIncidents, DomainStatus, EnvironmentStatus } from '@cairn/shared';

/** Пропсы списка статусов по окружениям. */
export interface IProps {
  /** Окружения проекта: здоровье каждого выведено из его адресов. */
  environments: EnvironmentStatus[];
  /** Адреса окружений с результатами всех трёх проверок. */
  addresses: DomainStatus[];
  /** Инциденты адресов; пусто — истории ещё нет либо доступа к ней нет. */
  incidents?: AddressIncidents[];
}

/** Пропсы строки адреса. */
export interface IAddressProps {
  address: DomainStatus;
  /** История падений этого адреса. */
  incidents?: AddressIncidents;
}
