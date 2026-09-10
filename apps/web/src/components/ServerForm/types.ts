import type { ServerCreate } from '@cairn/shared';

/** Значения полей формы сервера. */
export interface ServerFormValues {
  name: string;
  owner: string | null;
  host: string | null;
  ip: string | null;
  provider: string | null;
  specs: string | null;
  /** Календарная дата `YYYY-MM-DD` либо её отсутствие. */
  paidUntil: string | null;
  notes: string | null;
}

/** Пропсы формы сервера. */
export interface IProps {
  /** Текущие значения полей. */
  initial: ServerFormValues;
  /** Вызывается с готовыми к отправке значениями. */
  onSubmit: (input: ServerCreate) => void;
  /** Сообщение об ошибке. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
