/** Пропсы формы второго фактора. */
export interface IProps {
  /** Вызывается с шестизначным кодом. */
  onSubmit: (code: string) => void;
  /** Сообщение об ошибке предыдущей попытки. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
