import type { ChronicleEntryCreate } from '@cairn/shared';

/** Значения полей формы записи хроники. */
export interface ChronicleFormValues {
  occurredOn: string;
  title: string;
  content: string;
}

/** Пропсы формы записи. */
export interface IProps {
  /** Текущие значения полей. */
  initial: ChronicleFormValues;
  /** Вызывается с готовыми к отправке значениями. */
  onSubmit: (input: ChronicleEntryCreate) => void;
  /** Сообщение об ошибке. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
