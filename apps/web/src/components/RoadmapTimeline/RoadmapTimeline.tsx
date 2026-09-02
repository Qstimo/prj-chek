import { RoadmapVersionState } from '@cairn/shared';

import { sectorPath } from './sector';
import type { IProps, TimelineVersion } from './types';

/** Геометрия диаграммы. */
const STEP = 96;
const RADIUS = 16;
const CY = 28;

/**
 * Временная линия роадмапа (ТЗ 3.5): версии — отметки, заполненность
 * равна прогрессу, текущая выделена кольцом. Стадия читается без текста:
 * закрашенные слева, пустые справа, кольцо на текущей.
 */
export function RoadmapTimeline({ versions, currentIndex }: IProps) {
  if (versions.length === 0) {
    return <p className="text-muted-foreground">Версий пока нет.</p>;
  }

  const width = STEP * versions.length;

  return (
    <div className="w-full max-w-2xl">
      <svg role="img" aria-label="Диаграмма роадмапа" viewBox={`0 0 ${width} 56`} className="w-full">
        <line
          x1={STEP / 2}
          y1={CY}
          x2={width - STEP / 2}
          y2={CY}
          className="stroke-border"
          strokeWidth="2"
        />

        {versions.map((version, index) => (
          <Mark
            key={version.id}
            version={version}
            cx={STEP / 2 + STEP * index}
            isCurrent={index === currentIndex}
          />
        ))}
      </svg>

      {/* Подписи — в HTML, а не в SVG: текст SVG не умеет переноситься,
          и длинные названия версий налезали на соседние. Колонки flex
          повторяют равный шаг отметок, поэтому подпись стоит под своей. */}
      <div className="flex">
        {versions.map((version) => (
          <span key={version.id} className="min-w-0 flex-1 break-words px-1 text-center text-xs">
            {version.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Одна отметка: круг-основа, сектор прогресса, кольцо текущей. */
function Mark({
  version,
  cx,
  isCurrent,
}: {
  version: TimelineVersion;
  cx: number;
  isCurrent: boolean;
}) {
  const fraction = fractionOf(version);
  const sector = sectorPath(cx, CY, RADIUS, fraction);

  return (
    <g data-version={version.label} data-current={isCurrent ? 'true' : undefined}>
      <circle cx={cx} cy={CY} r={RADIUS} className="fill-background stroke-border" strokeWidth="2" />

      {sector === 'full' ? (
        <circle cx={cx} cy={CY} r={RADIUS} data-fill="full" className="fill-primary" />
      ) : (
        sector && <path d={sector} data-fill="partial" className="fill-primary" />
      )}

      {isCurrent && (
        <circle
          cx={cx}
          cy={CY}
          r={RADIUS + 5}
          className="fill-none stroke-primary"
          strokeWidth="2"
        />
      )}
    </g>
  );
}

/** Заполненность отметки: выпущенная всегда полная — выпущена, значит завершена. */
function fractionOf(version: TimelineVersion): number {
  if (version.state === RoadmapVersionState.Released) {
    return 1;
  }

  if (version.progress.total === 0) {
    return 0;
  }

  return version.progress.done / version.progress.total;
}
