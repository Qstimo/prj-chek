'use client';

import { useState } from 'react';

/** Пропсы кнопки отзыва. */
interface IProps {
  onRevoke: () => void;
  disabled?: boolean;
}

/** Отзыв адреса с подтверждением на месте: гасит все интеграции. */
export function RevokeButton({ onRevoke, disabled = false }: IProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsConfirming(true)}
        className="rounded-md border px-3 py-1 text-sm"
      >
        Отозвать адрес
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onRevoke}
        className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
      >
        Подтвердить отзыв
      </button>
      <button
        type="button"
        onClick={() => setIsConfirming(false)}
        className="rounded-md border px-3 py-1 text-sm"
      >
        Отмена
      </button>
    </div>
  );
}
