import type { EnvironmentCreate, EnvironmentKind } from '@cairn/shared';

/** Машина в списке выбора: только то, что нужно выпадающему списку. */
export interface ServerOption {
  id: string;
  name: string;
}

/** Значения полей формы окружения. */
export interface EnvironmentFormValues {
  name: string;
  kind: EnvironmentKind;
  serverId: string | null;
  /**
   * Имя привязанной машины.
   *
   * Приходит вместе с окружением, а не ищется в реестре: реестр машин
   * подрядчику не отдаётся вовсе, и искать в нём было бы нечего.
   */
  serverName: string | null;
  /** Путь ручки проверки. Адресами служат домены: их поле ниже. */
  healthCheckPath: string | null;
  notes: string | null;
  /** Домены окружения. Они же его адрес: отдельного поля адреса нет. */
  domains: string[];
}

/** Пропсы формы окружения. */
export interface IProps {
  /** Текущие значения полей. */
  initial: EnvironmentFormValues;
  /** Вызывается с готовыми к отправке значениями. */
  onSubmit: (input: EnvironmentCreate) => void;
  /** Машины реестра. Пусто для всех, кроме суперадмина. */
  servers?: ServerOption[];
  /** Право привязывать окружение к машине. Есть только у суперадмина. */
  canAssignServer?: boolean;
  /**
   * Известные адреса реестра для подсказки в поле доменов.
   *
   * Не передаётся никому, кроме суперадмина: подрядчику этот список
   * раскрыл бы чужие адреса, а через них — существование чужих проектов.
   */
  knownDomains?: string[];
  /** Сообщение об ошибке. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
