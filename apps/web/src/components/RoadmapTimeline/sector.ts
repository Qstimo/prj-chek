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

/** Округляет координату, чтобы разметка была устойчивой. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
