import { sectorPath } from './sector';
import type { TimelineVersion } from './types';
import { dateLabelOf, fractionOf } from './utils';

/** Геометрия отметки внутри колонки. */
const STEP = 96;
const CX = STEP / 2;
const CY = 28;
const RADIUS = 16;

/** Пропсы колонки диаграммы. */
interface IProps {
  version: TimelineVersion;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect?: (versionId: string) => void;
}

/**
 * Колонка диаграммы: отметка, название, дата.
 *
 * С обработчиком колонка — нативная кнопка: клик, фокус и клавиатура
 * без самодельной обвязки; сегменты линии соседних колонок смыкаются
 * на границах, образуя сплошную ось.
 */
export function TimelineColumn({ version, isCurrent, isFirst, isLast, onSelect }: IProps) {
  const content = (
    <>
      <svg aria-hidden="true" viewBox={`0 0 ${STEP} 56`} className="w-full">
        {!isFirst && (
          <line x1={0} y1={CY} x2={CX} y2={CY} className="stroke-border" strokeWidth="2" />
        )}
        {!isLast && (
          <line x1={CX} y1={CY} x2={STEP} y2={CY} className="stroke-border" strokeWidth="2" />
        )}
        <Mark version={version} isCurrent={isCurrent} />
      </svg>
      <span className="block break-words px-1 text-center text-xs">{version.label}</span>
      <span className="block min-h-4 px-1 text-center text-xs text-muted-foreground">
        {dateLabelOf(version)}
      </span>
    </>
  );

  if (!onSelect) {
    return <div className="min-w-0 flex-1">{content}</div>;
  }

  return (
    <button
      type="button"
      aria-label={`Версия ${version.label}`}
      onClick={() => onSelect(version.id)}
      className="min-w-0 flex-1 rounded-md"
    >
      {content}
    </button>
  );
}

/** Отметка: круг-основа, сектор прогресса, кольцо текущей. */
function Mark({ version, isCurrent }: { version: TimelineVersion; isCurrent: boolean }) {
  const sector = sectorPath(CX, CY, RADIUS, fractionOf(version));

  return (
    <g data-version={version.label} data-current={isCurrent ? 'true' : undefined}>
      <circle cx={CX} cy={CY} r={RADIUS} className="fill-background stroke-border" strokeWidth="2" />

      {sector === 'full' ? (
        <circle cx={CX} cy={CY} r={RADIUS} data-fill="full" className="fill-primary" />
      ) : (
        sector && <path d={sector} data-fill="partial" className="fill-primary" />
      )}

      {isCurrent && (
        <circle cx={CX} cy={CY} r={RADIUS + 5} className="fill-none stroke-primary" strokeWidth="2" />
      )}
    </g>
  );
}
