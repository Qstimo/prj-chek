import type { ReactNode } from 'react';

/** Пропсы показа текста саммари. */
export interface IProps {
  /** Текст созвона как он сохранён: выводится значением, не разметкой. */
  text: string;
  /** Адрес ленты хроники проекта, где живёт запись с этим текстом. */
  chronicleHref: string;
  /** Органы правки рядом с копированием: их заводит экран. */
  actions?: ReactNode;
}
