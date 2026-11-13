import { ITEM_CLASSES, MARK, MARK_HEIGHT, SLOT_CLASSES, STEP } from './constants';
import { sectorPath } from './sector';
import type { TimelineForm, TimelineVersion } from './types';
import { dateLabelOf, datePartsOf, fillOf, noteOf, percentOf } from './utils';

/** Пропсы элемента полосы. */
interface IProps {
  version: TimelineVersion;
  form: TimelineForm;
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
 * Версия на полосе: в ленте — колонка с отметкой, в списке — строка.
 *
 * Укладки две, но разметка одна: версия всегда ровно одна кнопка. Рисовать
 * обе формы и прятать лишнюю классом нельзя — это удвоило бы остановки
 * табуляции и дало бы по два узла с одним и тем же именем.
 *
 * С обработчиком элемент — нативная кнопка: клик, фокус и клавиатура без
 * самодельной обвязки.
 */
export function TimelineItem({
  version,
  form,
  isCurrent,
  isFirst,
  isLast,
  position,
  total,
  onSelect,
}: IProps) {
  const note = noteOf(version);
  const content =
    form === 'strip' ? (
      <StripBody
        version={version}
        isCurrent={isCurrent}
        isFirst={isFirst}
        isLast={isLast}
        note={note}
      />
    ) : (
      <ListBody version={version} isCurrent={isCurrent} note={note} date={dateLabelOf(version)} />
    );

  // Элемент списка несёт только место в ряду, а содержимое — внутренний
  // узел. `display: contents` на `<li>` был бы короче, но в части браузеров
  // он выносит элемент из дерева доступности, и список перестаёт быть
  // списком.
  const bodyClassName = `${ITEM_CLASSES[form]} w-full`;

  return (
    <li
      data-item
      data-version={version.label}
      data-current={isCurrent ? 'true' : undefined}
      className={SLOT_CLASSES[form]}
    >
      {onSelect ? (
        <button
          type="button"
          aria-label={`Версия ${version.label}`}
          aria-current={isCurrent ? 'step' : undefined}
          aria-posinset={position}
          aria-setsize={total}
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

/** Лента: отметка над подписью, шаг постоянный. */
function StripBody({
  version,
  isCurrent,
  isFirst,
  isLast,
  note,
}: {
  version: TimelineVersion;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  note: string;
}) {
  const { prefix, date } = datePartsOf(version);

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
        {!isFirst && (
          <line
            x1={0}
            y1={MARK.cy}
            x2={MARK.cx}
            y2={MARK.cy}
            className="stroke-border"
            strokeWidth="2"
          />
        )}
        {!isLast && (
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
