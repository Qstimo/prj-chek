'use client';

import type { IProps } from './types';

/**
 * Подтверждение действия, которое нечем отменить.
 *
 * Своё, а не браузерный `confirm()`: тот блокирует страницу целиком
 * и не поддаётся ни тестам, ни автоматизации.
 *
 * Не модальное окно, а блок на месте: подтверждение относится к тому,
 * рядом с чем стоит, и перекрывать собой панель, из которой пришло,
 * ему незачем. Таким же устроены подтверждения в реестрах серверов
 * и доменов.
 */
export function ConfirmDialog({ label, confirmLabel, onConfirm, onCancel, children }: IProps) {
  return (
    <div role="dialog" aria-label={label} className="rounded-md border border-border p-4">
      <p className="text-sm">{children}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1 text-sm"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
