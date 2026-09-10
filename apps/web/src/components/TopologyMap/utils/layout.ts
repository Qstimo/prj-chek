import type { StatusIndicator } from '@cairn/shared';

import { COLUMN_X, NODE_STEP_Y, NODE_WIDTH, PADDING } from '../constants';
import type { TopologyGraph } from '../types';

/** Узел карты с посчитанными координатами. */
export interface LayoutNode {
  id: string;
  side: 'left' | 'right';
  label: string;
  hint: string | null;
  indicator: StatusIndicator;
  x: number;
  y: number;
}

/** Ребро карты с координатами обоих концов. */
export interface LayoutEdge {
  leftId: string;
  rightId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
}

/** Готовая раскладка вместе с размерами полотна. */
export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

/**
 * Раскладка двухколоночного графа.
 *
 * Детерминированная: левые узлы колонкой с равным шагом в порядке, пришедшем
 * от API, правые — по среднему Y своих левых. Никакой физики и никакой
 * случайности: иначе раскладку нельзя проверить тестом, а карта прыгала бы
 * при каждой перерисовке.
 *
 * Правый узел без рёбер не размещается: карта отвечает на вопрос «что
 * связано», а не «что вообще существует».
 */
export function layoutTopology(graph: TopologyGraph): Layout {
  const leftY = new Map<string, number>();

  const leftNodes: LayoutNode[] = graph.left.map((node, index) => {
    const y = PADDING + index * NODE_STEP_Y;
    leftY.set(node.id, y);

    return { ...node, side: 'left', x: COLUMN_X.left, y };
  });

  const rightNodes: LayoutNode[] = [];
  const rightY = new Map<string, number>();
  // Сколько узлов уже стоит на этой высоте: два проекта на одной машине
  // получили бы один и тот же Y, и нижняя кнопка стала бы недостижима.
  const taken = new Map<number, number>();

  for (const node of graph.right) {
    const owners = graph.edges
      .filter((edge) => edge.rightId === node.id)
      .map((edge) => leftY.get(edge.leftId))
      .filter((y): y is number => y !== undefined);

    if (owners.length === 0) {
      continue;
    }

    const anchor = owners.reduce((sum, value) => sum + value, 0) / owners.length;
    const shift = taken.get(anchor) ?? 0;
    taken.set(anchor, shift + 1);

    const y = anchor + shift * NODE_STEP_Y;
    rightY.set(node.id, y);

    rightNodes.push({ ...node, side: 'right', x: COLUMN_X.right, y });
  }

  const edges: LayoutEdge[] = graph.edges.flatMap((edge) => {
    const from = leftY.get(edge.leftId);
    const to = rightY.get(edge.rightId);

    if (from === undefined || to === undefined) {
      return [];
    }

    return [
      {
        leftId: edge.leftId,
        rightId: edge.rightId,
        from: { x: COLUMN_X.left, y: from },
        to: { x: COLUMN_X.right, y: to },
        label: edge.label,
      },
    ];
  });

  const nodes = [...leftNodes, ...rightNodes];

  return {
    nodes,
    edges,
    width: nodes.length === 0 ? 0 : COLUMN_X.right + NODE_WIDTH / 2 + PADDING,
    height: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.y)) + PADDING,
  };
}
