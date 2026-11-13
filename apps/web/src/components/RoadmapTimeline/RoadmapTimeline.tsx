'use client';

import { useState } from 'react';

import { ROW_CLASSES, WRAPPER_CLASSES } from './constants';
import { TimelineItem } from './TimelineItem';
import type { IProps } from './types';
import { formOf, windowOf } from './utils';

/**
 * Временная линия роадмапа (ТЗ 3.5): версии — отметки, заполненность равна
 * прогрессу, текущая выделена кольцом, под названием — дата релиза.
 *
 * Укладок две, и выбирает их количество, а не человек. До десяти версий это
 * лента отметок: шаг постоянный, и отметка не зависит от того, сколько
 * соседей рядом — прежде колонки делили ширину поровну, и полоса беззвучно
 * сжималась в ряд точек с нечитаемыми подписями. Дальше это вертикальный
 * список: так в проекте показывают любые длинные перечни, строка остаётся
 * целью нажатия в 44 px при любом числе версий, а прокручивает её страница,
 * а не отдельная область, дерущаяся с жестом прокрутки на телефоне.
 *
 * Ширину задаёт страница: собственный потолок был уже контейнеров обоих
 * экранов и часть тесноты создавал сам.
 */
export function RoadmapTimeline({ versions, currentIndex, onSelect }: IProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (versions.length === 0) {
    return <p className="text-muted-foreground">Версий пока нет.</p>;
  }

  const form = formOf(versions.length);
  const visible = windowOf(versions, currentIndex, isExpanded);

  return (
    <div role="group" aria-label="Диаграмма роадмапа" className="space-y-2">
      <div data-form={form} className={WRAPPER_CLASSES[form]}>
        <ul className={ROW_CLASSES[form]}>
          {visible.items.map((version, index) => {
            const position = versions.length - visible.items.length + index;

            return (
              <TimelineItem
                key={version.id}
                version={version}
                form={form}
                isCurrent={position === currentIndex}
                isFirst={index === 0}
                isLast={index === visible.items.length - 1}
                position={position + 1}
                total={versions.length}
                onSelect={onSelect}
              />
            );
          })}
        </ul>
      </div>

      {visible.hidden > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {/* Усечение обязано называть себя словами — как у истории падений. */}
          <span>
            Показаны {visible.items.length} из {versions.length}
          </span>
          {/*
            Без числа в подписи: «все 21 версию» не согласуется ни при каком
            склонении, а количество уже названо строкой слева.
          */}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="rounded-md border px-2 py-0.5"
          >
            Показать все
          </button>
        </p>
      )}
    </div>
  );
}
