/** Значения формы учётки. */
export interface UserFormValues {
  name: string;
  email: string;
}

/** Пропсы формы учётки. */
export interface IProps {
  initial: UserFormValues;
  /** Подпись кнопки: форма одна на приглашение и правку. */
  submitLabel: string;
  onSubmit: (values: UserFormValues) => void;
  error?: string;
  isSubmitting?: boolean;
}
