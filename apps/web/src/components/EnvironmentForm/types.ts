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
  /** Собственный адрес окружения; перекрывает адрес машины. */
  host: string | null;
  serverId: string | null;
  /**
   * Имя привязанной машины.
   *
   * Приходит вместе с окружением, а не ищется в реестре: реестр машин
   * подрядчику не отдаётся вовсе, и искать в нём было бы нечего.
   */
  serverName: string | null;
  healthCheckUrl: string | null;
  notes: string | null;
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
  /** Сообщение об ошибке. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
