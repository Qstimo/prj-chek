'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Адрес страницы версии, если он у экрана есть.
 *
 * `null` означает «вести некуда»: так устроена публичная страница
 * роадмапа — ссылок внутрь системы на ней нет и быть не должно.
 */
const TimelineHrefContext = createContext<((versionId: string) => string) | null>(null);

/**
 * Куда ведёт версия на полосе.
 *
 * Контекстом, а не пропом полосы: адрес нужен самой отметке, а полоса
 * только передавала бы его вниз через три укладки, ничего о нём не зная.
 * Заодно экран остаётся единственным местом, которое знает, как собрать
 * адрес страницы отчёта, — второй экземпляр этого правила разошёлся бы
 * с первым при переносе маршрута.
 */
export function TimelineHrefProvider({
  hrefOf,
  children,
}: {
  hrefOf: (versionId: string) => string;
  children: ReactNode;
}) {
  return <TimelineHrefContext.Provider value={hrefOf}>{children}</TimelineHrefContext.Provider>;
}

/** Способ собрать адрес версии либо `null`, если его не задали. */
export function useTimelineHref(): ((versionId: string) => string) | null {
  return useContext(TimelineHrefContext);
}
