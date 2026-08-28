import type { VariableCreate, VariableUpdate } from '@cairn/shared';

/** Начальные значения формы: при правке значение не показывается. */
export interface VariableFormInitial {
  key: string;
  description: string | null;
}

/** Пропсы формы переменной. */
export interface IProps {
  /** Начальные значения. Отсутствие — форма создания. */
  initial?: VariableFormInitial;
  /** Правка: значение необязательно и пустым не отправляется. */
  isEditing?: boolean;
  onSubmit: (input: VariableCreate | VariableUpdate) => void;
  error?: string;
  isSubmitting?: boolean;
}
