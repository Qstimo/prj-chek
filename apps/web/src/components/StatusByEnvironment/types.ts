import type { DomainStatus, EnvironmentStatus } from '@cairn/shared';

/** Пропсы списка статусов по окружениям. */
export interface IProps {
  /** Окружения проекта: здоровье каждого выведено из его адресов. */
  environments: EnvironmentStatus[];
  /** Адреса окружений с результатами всех трёх проверок. */
  addresses: DomainStatus[];
}

/** Пропсы строки адреса. */
export interface IAddressProps {
  address: DomainStatus;
}
