'use client';

import { INDICATOR_COLORS, INDICATOR_LABELS } from '../StatusIndicator/constants';
import type { LayoutNode } from './utils';

/** Пропсы узла карты. */
interface IProps {
  node: LayoutNode;
  /** Как называется вид узла в доступном имени: «Сервер», «Домен», «Проект». */
  kindLabel: string;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: (id: string) => void;
}

/**
 * Узел карты.
 *
 * Обычная кнопка поверх SVG, а не текст внутри `foreignObject`: только так
 * узел получает фокус, читается скринридером и оформляется токенами.
 */
export function MapNode({ node, kindLabel, isSelected, isDimmed, onSelect }: IProps) {

  return (
    <button
      type="button"
      data-testid={`node-${node.id}`}
      data-selected={isSelected}
      aria-label={`${kindLabel} ${node.label}, ${INDICATOR_LABELS[node.indicator].toLowerCase()}`}
      onClick={() => onSelect(node.id)}
      style={{ left: node.x, top: node.y }}
      className={`absolute w-44 -translate-x-1/2 -translate-y-1/2 rounded-md border p-2 text-left transition ${
        isSelected ? 'border-border-strong bg-surface-strong' : 'border-border bg-surface'
      } ${isDimmed ? 'opacity-40' : ''}`}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${INDICATOR_COLORS[node.indicator]}`}
          aria-hidden
        />
        <span className="truncate text-sm font-medium">{node.label}</span>
      </span>
      {node.hint && <span className="block truncate text-xs text-muted-foreground">{node.hint}</span>}
    </button>
  );
}
