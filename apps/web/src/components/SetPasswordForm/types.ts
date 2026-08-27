/** Пропсы формы установки пароля. */
export interface IProps {
  /** Вызывается с проверенным паролем. */
  onSubmit: (password: string) => void;
  /** Сообщение об ошибке. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
