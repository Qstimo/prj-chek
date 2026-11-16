import type { DomainStatus, EnvironmentStatus } from '@cairn/shared';

/** Пропсы таблицы проверок по окружениям. */
export interface IProps {
  /** Окружения проекта: здоровье каждого выведено из его адресов. */
  environments: EnvironmentStatus[];
  /** Адреса окружений с результатами всех трёх проверок. */
  addresses: DomainStatus[];
  /**
   * Открыть разбор адреса. Без обработчика адрес остаётся текстом.
   *
   * Мёртвая кнопка хуже текста: она обещает действие, которого нет.
   */
  onSelect?: (domainId: string) => void;
}

/** Пропсы строки адреса. */
export interface IAddressProps {
  address: DomainStatus;
  onSelect?: (domainId: string) => void;
}
