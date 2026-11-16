import Link from 'next/link';
import type { CSSProperties, MouseEvent } from 'react';

import {
  ITEM_CLASSES,
  MARK,
  MARK_HEIGHT,
  SLOT_CLASSES,
  SLOT_HEIGHT,
  STEP,
} from './constants';
import { useTimelineHref } from './href';
import { sectorPath } from './sector';
import type { TimelineCell, TimelineForm, TimelineVersion } from './types';
import { dateLabelOf, datePartsOf, fillOf, noteOf, percentOf } from './utils';

/** Пропсы элемента полосы. */
interface IProps {
  version: TimelineVersion;
  form: TimelineForm;
  /** Место в сетке серпантина. В прочих укладках его нет. */
  cell?: TimelineCell;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Номер в наборе, с единицы: нужен скринридеру при усечённом окне. */
  position: number;
  /** Всего версий в наборе — тоже для скринридера. */
  total: number;
  onSelect?: (versionId: string) => void;
}

/**
 * Версия на полосе: в ленте и серпантине — место с отметкой, в списке — строка.
 *
 * Укладок три, но разметка одна: версия всегда ровно один управляющий
 * элемент. Рисовать несколько форм и прятать лишние классом нельзя — это
 * умножило бы остановки табуляции и дало бы по нескольку узлов с одним и
 * тем же именем.
 *
 * Элемент — нативная кнопка или нативная ссылка: клик, фокус и клавиатура
 * без самодельной обвязки. Ссылкой версия становится там, где у экрана есть
 * страница версии (отчёт по релизу): у кнопки нет ни Ctrl+клика в новую
 * вкладку, ни копирования адреса. Простой щелчок при этом по-прежнему
 * открывает панель версии — правка живёт в ней, и уводить человека со
 * страницы при каждом щелчке значило бы отнять единственный путь к ней.
 */
export function TimelineItem({
  version,
  form,
  cell,
  isCurrent,
  isFirst,
  isLast,
  position,
  total,
  onSelect,
}: IProps) {
  const hrefOf = useTimelineHref();
  const href = hrefOf?.(version.id);
  const note = noteOf(version);
  const content =
    form === 'list' ? (
      <ListBody version={version} isCurrent={isCurrent} note={note} date={dateLabelOf(version)} />
    ) : (
      <StripBody
        version={version}
        isCurrent={isCurrent}
        isFirst={isFirst}
        isLast={isLast}
        isReversed={cell?.isReversed ?? false}
        note={note}
      />
    );

  // Элемент списка несёт только место в ряду, а содержимое — внутренний
  // узел. `display: contents` на `<li>` был бы короче, но в части браузеров
  // он выносит элемент из дерева доступности, и список перестаёт быть
  // списком.
  const bodyClassName = `${ITEM_CLASSES[form]} w-full`;
  // Ссылка по умолчанию строчная, а кнопка — нет: без явного `block`
  // отметка и подписи в ленте разъехались бы по строчным боксам. В списке
  // раскладку задаёт `flex` из `ITEM_CLASSES`, и второе правило `display`
  // там спорило бы с ним.
  const linkClassName = form === 'list' ? bodyClassName : `${bodyClassName} block`;

  return (
    <li
      data-item
      data-version={version.label}
      data-current={isCurrent ? 'true' : undefined}
      // Место в наборе — на элементе списка, а не на кнопке: роль
      // `listitem` носит он, и на кнопке эти значения читалка не берёт.
      // Счёт идёт от начала окна, которое умеет съезжать к текущей версии.
      aria-posinset={position}
      aria-setsize={total}
      className={SLOT_CLASSES[form]}
      style={slotStyleOf(form, cell)}
    >
      {href ? (
        <Link
          href={href}
          aria-label={`Версия ${version.label}`}
          aria-current={isCurrent ? 'step' : undefined}
          // Щелчок с клавишей-ускорителем и щелчок не основной кнопкой
          // оставлены браузеру: это «открой в новой вкладке», и перехватить
          // его значило бы отнять у ссылки то, ради чего она здесь.
          onClick={onSelect ? (event) => select(event, version.id, onSelect) : undefined}
          className={`${linkClassName} hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}
        >
          {content}
        </Link>
      ) : onSelect ? (
        <button
          type="button"
          aria-label={`Версия ${version.label}`}
          aria-current={isCurrent ? 'step' : undefined}
          onClick={() => onSelect(version.id)}
          className={`${bodyClassName} hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}
        >
          {content}
        </button>
      ) : (
        <div className={bodyClassName}>{content}</div>
      )}
    </li>
  );
}

/**
 * Выбор версии простым щелчком по ссылке.
 *
 * Простой щелчок открывает панель версии и отменяет переход: правка версии
 * живёт в панели, и уводить человека на отчёт при каждом щелчке значило бы
 * отнять единственный путь к правке. Щелчок с Ctrl, Cmd, Shift или Alt и
 * щелчок средней кнопкой — это «открой в новой вкладке»; они уходят
 * браузеру нетронутыми, и ровно ради них элемент стал ссылкой.
 */
function select(
  event: MouseEvent<HTMLAnchorElement>,
  versionId: string,
  onSelect: (versionId: string) => void,
): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
    return;
  }

  event.preventDefault();
  onSelect(versionId);
}

/**
 * Размеры места и его адрес в сетке.
 *
 * Ширина берётся из шага оси, а не из класса: `w-24` совпадал с шагом
 * только при корневом шрифте 16 px, то есть шаг был задан дважды. Высота
 * задана лишь в серпантине — по ней колено находит центры отметок.
 */
function slotStyleOf(form: TimelineForm, cell?: TimelineCell): CSSProperties | undefined {
  if (form === 'list') {
    return undefined;
  }

  if (!cell) {
    return { width: STEP };
  }

  return {
    width: STEP,
    height: SLOT_HEIGHT,
    gridColumn: cell.gridColumn,
    gridRow: cell.gridRow,
  };
}

/** Лента: отметка над подписью, шаг постоянный. */
function StripBody({
  version,
  isCurrent,
  isFirst,
  isLast,
  isReversed,
  note,
}: {
  version: TimelineVersion;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  isReversed: boolean;
  note: string;
}) {
  const { prefix, date } = datePartsOf(version);
  // В строке серпантина, идущей справа налево, предшественник версии лежит
  // справа, а продолжение — слева: сторону полуотрезка задаёт направление
  // строки, иначе у края набора ось уходит в пустоту.
  const hasLeft = isReversed ? !isLast : !isFirst;
  const hasRight = isReversed ? !isFirst : !isLast;

  return (
    <>
      {/*
        Размер задан атрибутами, а не классом `w-full`: с классом разметка
        масштабировалась вместе с колонкой, и отметка на полусотне версий
        вырождалась в точку вместе с обводкой оси.
      */}
      <svg
        aria-hidden="true"
        width={STEP}
        height={MARK_HEIGHT}
        viewBox={`0 0 ${STEP} ${MARK_HEIGHT}`}
      >
        {hasLeft && (
          <line
            x1={0}
            y1={MARK.cy}
            x2={MARK.cx}
            y2={MARK.cy}
            className="stroke-border"
            strokeWidth="2"
          />
        )}
        {hasRight && (
          <line
            x1={MARK.cx}
            y1={MARK.cy}
            x2={STEP}
            y2={MARK.cy}
            className="stroke-border"
            strokeWidth="2"
          />
        )}
        <Mark version={version} isCurrent={isCurrent} />
      </svg>

      <span className="block truncate px-1 text-center text-xs" title={version.label}>
        {version.label}
      </span>
      {/*
        Пояснение и число — двумя строками: вместе они шире шага, и в одну
        строку дата обрезалась бы многоточием ровно там, где она и нужна.
      */}
      <span className="block min-h-4 px-1 text-center text-xs leading-4 text-muted-foreground">
        {/* Пояснение без даты — бессмыслица: нет числа, нечего и пояснять. */}
        {date && prefix && <span className="block truncate">{prefix.trim()}</span>}
        <span className="block truncate whitespace-nowrap">{date}</span>
      </span>
      <span className="block min-h-4 truncate px-1 text-center text-xs text-muted-foreground">
        {note}
      </span>
    </>
  );
}

/**
 * Список: полоска прогресса вместо пирога.
 *
 * Пирог в строке высотой 44 px был бы вдвое меньше ленточного и потерял бы
 * последнее, ради чего он есть, — различимость заполнения. Полоска при той
 * же высоте читается тем точнее, чем она длиннее.
 */
function ListBody({
  version,
  isCurrent,
  note,
  date,
}: {
  version: TimelineVersion;
  isCurrent: boolean;
  note: string;
  date: string;
}) {
  const percent = percentOf(version);

  return (
    <>
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${isCurrent ? 'bg-primary ring-2 ring-primary/40' : 'bg-border'}`}
      />

      <span className="min-w-0 flex-1 truncate text-xs" title={version.label}>
        {version.label}
      </span>

      <span
        aria-hidden="true"
        className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-border sm:block"
      >
        <span data-fill={percent} className="block h-full bg-primary" style={{ width: `${percent}%` }} />
      </span>

      <span className="w-24 shrink-0 truncate text-right text-xs text-muted-foreground">
        {note}
      </span>
      <span className="hidden w-32 shrink-0 truncate whitespace-nowrap text-right text-xs text-muted-foreground sm:block">
        {date}
      </span>
    </>
  );
}

/** Отметка: круг-основа, сектор прогресса, кольцо текущей. */
function Mark({ version, isCurrent }: { version: TimelineVersion; isCurrent: boolean }) {
  const sector = sectorPath(MARK.cx, MARK.cy, MARK.radius, fillOf(version));

  return (
    <g>
      <circle
        cx={MARK.cx}
        cy={MARK.cy}
        r={MARK.radius}
        className="fill-background stroke-border"
        strokeWidth="2"
      />

      {sector === 'full' ? (
        <circle cx={MARK.cx} cy={MARK.cy} r={MARK.radius} data-fill="full" className="fill-primary" />
      ) : (
        sector && <path d={sector} data-fill="partial" className="fill-primary" />
      )}

      {isCurrent && (
        <circle
          cx={MARK.cx}
          cy={MARK.cy}
          r={MARK.radius + 5}
          className="fill-none stroke-primary"
          strokeWidth="2"
        />
      )}
    </g>
  );
}
