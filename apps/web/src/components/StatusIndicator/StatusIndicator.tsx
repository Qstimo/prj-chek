import { INDICATOR_COLORS, INDICATOR_LABELS } from './constants';
import type { IProps } from './types';

/** Индикатор статуса проекта: точка и слово (ТЗ 6, ТЗ 8). */
export function StatusIndicator({ indicator, label, title }: IProps) {
  return (
    <span data-indicator={indicator} title={title} className="inline-flex items-center gap-1.5 text-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${INDICATOR_COLORS[indicator]}`} aria-hidden />
      {label ?? INDICATOR_LABELS[indicator]}
    </span>
  );
}
