'use client';

import { useEffect } from 'react';

/**
 * Предупреждение браузера при уходе со страницы с несохранённым.
 *
 * Единственное место в приложении, где подтверждение не наше: обновление,
 * закрытие вкладки и переход по закладке своим `ConfirmDialog` не
 * перехватываются вовсе — браузер спрашивает сам и только по
 * `preventDefault` на `beforeunload`.
 *
 * Слушатель ставится лишь при несохранённом: постоянный заставлял бы
 * браузер спрашивать и там, где терять нечего, и предупреждение
 * перестали бы читать.
 */
export function useUnsavedWarning(hasUnsaved: boolean): void {
  useEffect(() => {
    if (!hasUnsaved) {
      return;
    }

    function warn(event: BeforeUnloadEvent): void {
      event.preventDefault();
    }

    window.addEventListener('beforeunload', warn);

    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);
}
