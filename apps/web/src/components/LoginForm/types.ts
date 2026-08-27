import type { LoginInput } from '@cairn/shared';

/** Пропсы формы входа. */
export interface IProps {
  /** Вызывается с проверенными данными. */
  onSubmit: (input: LoginInput) => void;
  /** Сообщение об ошибке предыдущей попытки. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
