import type { EnvironmentCreate, EnvironmentKind } from '@cairn/shared';

/** Значения полей формы окружения. */
export interface EnvironmentFormValues {
  name: string;
  kind: EnvironmentKind;
  host: string | null;
  ip: string | null;
  provider: string | null;
  specs: string | null;
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
  /** Сообщение об ошибке. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
