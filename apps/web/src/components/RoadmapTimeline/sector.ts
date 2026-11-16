/**
 * Путь SVG для сектора-«пирога» от 12 часов по часовой стрелке.
 *
 * Возвращает `null` при нулевой доле (рисовать нечего) и признак `'full'`
 * при единичной: дуга на 360° вырождается, полный круг рисуется кругом.
 */
export function sectorPath(
  cx: number,
  cy: number,
  r: number,
  fraction: number,
): string | 'full' | null {
  if (fraction <= 0) {
    return null;
  }

  if (fraction >= 1) {
    return 'full';
  }

  const angle = 2 * Math.PI * fraction;
  const endX = cx + r * Math.sin(angle);
  const endY = cy - r * Math.cos(angle);
  const largeArc = fraction > 0.5 ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${cx} ${cy - r}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${round(endX)} ${round(endY)}`,
    'Z',
  ].join(' ');
}

/** Откуда и куда ведёт колено серпантина. */
interface IKnee {
  /** Сторона поворота: куда строка ушла, туда и колено. */
  side: 'left' | 'right';
  /** Ширина столбца поворота. */
  width: number;
  /** Уровень центра отметки в строке, из которой колено выходит. */
  markY: number;
  /** Уровень центра отметки в строке, в которую колено приходит. */
  bottomY: number;
  /** Радиус закругления углов. */
  radius: number;
}

/**
 * Путь SVG для перемычки между строками серпантина.
 *
 * Колено, а не вертикаль: ось у версии — два полуотрезка в её собственном
 * SVG шириной в шаг, и выйти из них вниз нечем. Перемычка живёт в крайнем
 * столбце сетки и ведёт от края места версии (где её полуотрезок оси
 * кончился) к краю места первой версии следующей строки — вправо, вниз и
 * обратно влево, либо зеркально.
 */
export function kneePath({ side, width, markY, bottomY, radius }: IKnee): string {
  // Знак направления: вправо колено уходит от нуля к ширине, влево —
  // наоборот, и дуги закручиваются в противоположные стороны.
  const isRight = side === 'right';
  const startX = isRight ? 0 : width;
  const turnX = isRight ? width - radius : radius;
  const edgeX = isRight ? width : 0;
  const sweep = isRight ? 1 : 0;

  return [
    `M ${startX} ${markY}`,
    `H ${turnX}`,
    `A ${radius} ${radius} 0 0 ${sweep} ${edgeX} ${markY + radius}`,
    `V ${bottomY - radius}`,
    `A ${radius} ${radius} 0 0 ${sweep} ${turnX} ${bottomY}`,
    `H ${startX}`,
  ].join(' ');
}

/** Округляет координату, чтобы разметка была устойчивой. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
