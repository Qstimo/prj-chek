import type { DomainCreate } from '@cairn/shared';

/** Значения полей формы корневого домена. */
export interface DomainFormValues {
  name: string;
  owner: string | null;
  registrar: string | null;
  /** Календарная дата `YYYY-MM-DD` либо её отсутствие. */
  paidUntil: string | null;
  notes: string | null;
}

/** Пропсы формы корневого домена. */
export interface IProps {
  initial: DomainFormValues;
  onSubmit: (input: DomainCreate) => void;
  error?: string;
  isSubmitting?: boolean;
  /** Имя нельзя менять у уже заведённого корня: за ним висят поддомены. */
  isNameLocked?: boolean;
}
