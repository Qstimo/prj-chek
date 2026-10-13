'use client';

import { BUTTON_CLASS, RESET_CONFIRMATION } from './constants';

/** Пропсы диалога подтверждения сброса пароля. */
interface IProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Подтверждение сброса пароля.
 *
 * Сброс завершает все сессии человека и лишает его входа до перехода
 * по новой ссылке — соседство в списке с безобидным сбросом второго
 * фактора делает ошибочное нажатие вероятным (спека 9.1).
 */
export function ResetConfirmDialog({ onConfirm, onCancel }: IProps) {
  return (
    <div
      role="dialog"
      aria-label="Подтверждение сброса"
      className="rounded-md border border-border p-4"
    >
      <p>{RESET_CONFIRMATION}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-destructive px-3 py-1 text-destructive-foreground"
          onClick={onConfirm}
        >
          Да, сбросить
        </button>
        <button type="button" className={BUTTON_CLASS} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
