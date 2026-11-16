'use client';

import {
  DEFAULT_LAST,
  KNEE_HEIGHT,
  KNEE_RADIUS,
  MARK,
  ROW_CLASSES,
  SLOT_HEIGHT,
  TURN_WIDTH,
  WRAPPER_CLASSES,
} from './constants';
import { useMeasuredWidth } from './measure';
import { kneePath } from './sector';
import { TimelineItem } from './TimelineItem';
import type { IProps, TimelineKnee } from './types';
import {
  columnsFor,
  columnsTemplate,
  formOf,
  rowsTemplate,
  serpentinePlan,
  windowOf,
  windowSizeOf,
} from './utils';

/**
 * Временная линия роадмапа (ТЗ 3.5): версии — отметки, заполненность равна
 * прогрессу, текущая выделена кольцом, под названием — дата релиза.
 *
 * Укладок три, и выбирает их человек: переключатель живёт в экране и
 * воспроизводится ссылкой. По умолчанию выбран серпантин:
 * та же лента, сложенная змейкой по измеренной ширине места, с
 * перемычкой-коленом между строками. Список остаётся третьей укладкой —
 * так в проекте показывают любые длинные перечни, и строка там остаётся
 * целью нажатия в 44 px при любом числе версий.
 *
 * Ширину задаёт страница: собственный потолок был уже контейнеров обоих
 * экранов и часть тесноты создавал сам.
 */
export function RoadmapTimeline({
  versions,
  currentIndex,
  form,
  last,
  onSelect,
  onChangeLast,
}: IProps) {
  // Измеряется обёртка полосы: серпантину нужна ширина его места, а не
  // окна — на внутреннем экране и на публичной странице они разные.
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();

  const layout = form ?? formOf(versions.length);
  const size = windowSizeOf(layout, last);
  const isExpanded = last === null;
  const visible = windowOf(versions, currentIndex, false, size);
  const plan =
    layout === 'serpentine' ? serpentinePlan(visible.items.length, columnsFor(width)) : null;
  const isTruncatable = versions.length > (isExpanded ? DEFAULT_LAST : size);

  if (versions.length === 0) {
    return <p className="text-muted-foreground">Версий пока нет.</p>;
  }

  return (
    <div role="group" aria-label="Диаграмма роадмапа" className="space-y-2">
      <div ref={ref} data-form={layout} className={WRAPPER_CLASSES[layout]}>
        <ul
          className={ROW_CLASSES[layout]}
          style={
            plan
              ? {
                  gridTemplateColumns: columnsTemplate(plan.columns),
                  gridTemplateRows: rowsTemplate(plan.rows),
                }
              : undefined
          }
        >
          {visible.items.map((version, index) => {
            // Позиция считается от начала окна: оно умеет съезжать к
            // текущей версии, и «отрезано с конца» при съехавшем окне
            // уводило метку «вы здесь» с полосы совсем.
            const position = visible.start + index;

            return (
              <TimelineItem
                key={version.id}
                version={version}
                form={layout}
                cell={plan?.cells[index]}
                isCurrent={position === currentIndex}
                isFirst={index === 0}
                isLast={index === visible.items.length - 1}
                position={position + 1}
                total={versions.length}
                onSelect={onSelect}
              />
            );
          })}

          {plan?.knees.map((knee) => (
            <Knee key={`${knee.gridRow}-${knee.side}`} knee={knee} />
          ))}
        </ul>
      </div>

      {isTruncatable && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {/* Усечение обязано называть себя словами — как у истории падений. */}
          <span>
            {isExpanded
              ? `Показаны все ${versions.length}`
              : `Показаны ${visible.items.length} из ${versions.length}`}
          </span>
          {/*
            Кнопка обратима: прежде подвал исчезал по условию «есть
            скрытые», и свернуть раскрытое было нечем.

            Без числа в подписи раскрытия: «все 21 версию» не согласуется
            ни при каком склонении, а количество уже названо строкой слева.
          */}
          {onChangeLast && (
            <button
              type="button"
              onClick={() => onChangeLast(isExpanded ? DEFAULT_LAST : null)}
              className="rounded-md border px-2 py-0.5"
            >
              {isExpanded ? 'Свернуть' : 'Показать все'}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Перемычка между строками серпантина.
 *
 * Своим элементом, а не частью версии: ось у версии — два полуотрезка в её
 * собственном SVG шириной в шаг, и повернуть из него на строку вниз нечем.
 * Перемычка занимает крайний столбец сетки и три её строки подряд — строку
 * версий, строку поворота и следующую строку версий, — поэтому концы колена
 * попадают ровно в центры отметок обеих строк.
 *
 * Для скринридера её нет: это рисунок оси, а не содержимое.
 */
function Knee({ knee }: { knee: TimelineKnee }) {
  const height = SLOT_HEIGHT * 2 + KNEE_HEIGHT;

  return (
    <li
      aria-hidden="true"
      data-knee={knee.side}
      style={{ gridColumn: knee.gridColumn, gridRow: `${knee.gridRow} / span 3`, height }}
    >
      <svg width={TURN_WIDTH} height={height} viewBox={`0 0 ${TURN_WIDTH} ${height}`}>
        <path
          d={kneePath({
            side: knee.side,
            width: TURN_WIDTH,
            markY: MARK.cy,
            bottomY: SLOT_HEIGHT + KNEE_HEIGHT + MARK.cy,
            radius: KNEE_RADIUS,
          })}
          className="fill-none stroke-border"
          strokeWidth="2"
        />
      </svg>
    </li>
  );
}
