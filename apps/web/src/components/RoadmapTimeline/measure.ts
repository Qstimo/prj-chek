'use client';

import { useEffect, useState } from 'react';

/**
 * Измеренная ширина элемента.
 *
 * Серпантину нужна не догадка о ширине экрана, а ширина его собственного
 * места: внутренний экран даёт под содержимое 976 px, публичная страница —
 * 720, и выведенный из первой зашитый порог уводил вторую в прокрутку.
 * Наблюдатель, а не однократное измерение: место меняется без перерисовки
 * страницы — поворот телефона, выехавшая панель, изменение масштаба.
 *
 * Ноль означает «ещё не измерено», и укладка обязана уметь работать по
 * умолчанию: в jsdom размеров нет вовсе, а до первой отрисовки их нет
 * и в браузере.
 */
export function useMeasuredWidth<T extends HTMLElement>() {
  // Узел может появиться после пустого роадмапа: ref-объект сам по себе
  // не перезапускает эффект. Callback ref сообщает и появление, и снятие.
  const [node, ref] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!node) {
      return undefined;
    }

    const measure = () => setWidth(node.clientWidth);

    measure();

    // Наблюдателя нет в jsdom и в старых браузерах: однократного
    // измерения достаточно, чтобы укладка не осталась с умолчанием.
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(node);

    return () => observer.disconnect();
  }, [node]);

  return { ref, width };
}
