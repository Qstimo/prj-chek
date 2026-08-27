'use client';

import { useEffect, useState } from 'react';

/**
 * Возвращает значение с задержкой.
 *
 * Нужен фильтрам: без задержки запрос уходил бы на каждое нажатие клавиши.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
