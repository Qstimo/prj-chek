'use client';

import { useState } from 'react';

/** Пропсы кнопки удаления версии. */
interface IProps {
  onDelete: () => void;
}

/** Удаление версии в два шага: оно уносит все её чекпоинты. */
export function DeleteVersionButton({ onDelete }: IProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className="rounded-md border px-3 py-1 text-sm"
      >
        Удалить версию
      </button>
    );
  }

  return (
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
  );
}
