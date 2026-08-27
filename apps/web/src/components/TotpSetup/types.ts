import type { TotpSetupResponse } from '@cairn/shared';

/** Пропсы экрана привязки второго фактора. */
export interface IProps {
  /** Секрет и ссылка, выданные при начале привязки. */
  setup: TotpSetupResponse;
  /** Вызывается с шестизначным кодом подтверждения. */
  onConfirm: (code: string) => void;
  /** Сообщение об ошибке предыдущей попытки. */
  error?: string;
  /** Подтверждение в процессе. */
  isSubmitting?: boolean;
}
