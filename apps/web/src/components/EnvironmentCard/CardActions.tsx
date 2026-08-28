'use client';

import { useState } from 'react';

/** Пропсы кнопок действий карточки. */
interface IProps {
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Правка и удаление окружения.
 *
 * Подтверждение удаления спрашивается на месте: браузерный диалог
 * заблокировал бы страницу.
 */
export function CardActions({ onEdit, onDelete }: IProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <div className="flex gap-2">
      <button type="button" onClick={onEdit} className="rounded-md border px-3 py-1 text-sm">
        Править
      </button>

      {isConfirming ? (
        <>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
          >
            Подтвердить удаление
          </button>
          <button
            type="button"
            onClick={() => setIsConfirming(false)}
            className="rounded-md border px-3 py-1 text-sm"
          >
            Отмена
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Удалить
        </button>
      )}
    </div>
  );
}
