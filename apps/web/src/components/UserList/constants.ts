/** Подписи действий над пользователем. */
export const ACTION_LABELS = {
  revoke: 'Отозвать доступ',
  restore: 'Восстановить',
  resetPassword: 'Сбросить пароль',
  resetTotp: 'Сбросить второй фактор',
} as const;

/** Текст подтверждения сброса пароля. */
export const RESET_CONFIRMATION =
  'Пароль будет обнулён, все сессии пользователя завершены. Он сможет войти только по новой ссылке.';

/** Оформление кнопок действий. */
export const BUTTON_CLASS = 'rounded-md border border-border px-3 py-1 text-sm';
