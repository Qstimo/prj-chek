import { StatusIndicator } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import type { TopologyGraph } from '../types';
import { layoutTopology } from './layout';

const LEFT_A = '11111111-1111-1111-1111-111111111111';
const LEFT_B = '22222222-2222-2222-2222-222222222222';
const RIGHT_A = '33333333-3333-3333-3333-333333333333';
const RIGHT_B = '44444444-4444-4444-4444-444444444444';

function node(id: string, label: string): TopologyGraph['left'][number] {
  return { id, label, hint: null, indicator: StatusIndicator.Ok };
}

function edge(leftId: string, rightId: string): TopologyGraph['edges'][number] {
  return { leftId, rightId, label: 'Прод' };
}

describe('раскладка карты топологии', () => {
  it('пустой граф не занимает места', () => {
    const layout = layoutTopology({ left: [], right: [], edges: [] });

    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });

  it('левые узлы стоят колонкой: один X, разный Y', () => {
    // Порядок задаёт API, раскладка его сохраняет: вторая сортировка была
    // бы вторым местом, где порядок можно изменить.
    const layout = layoutTopology({
      left: [node(LEFT_A, 'альфа'), node(LEFT_B, 'бета')],
      right: [],
      edges: [],
    });

    const left = layout.nodes.filter((item) => item.side === 'left');

    expect(left.map((item) => item.label)).toEqual(['альфа', 'бета']);
    expect(new Set(left.map((item) => item.x)).size).toBe(1);
    expect(left[0]!.y).toBeLessThan(left[1]!.y);
  });

  it('правые узлы стоят правее левых', () => {
    const layout = layoutTopology({
      left: [node(LEFT_A, 'альфа')],
      right: [node(RIGHT_A, 'Витрина')],
      edges: [edge(LEFT_A, RIGHT_A)],
    });

    const left = layout.nodes.find((item) => item.side === 'left')!;
    const right = layout.nodes.find((item) => item.side === 'right')!;

    expect(right.x).toBeGreaterThan(left.x);
  });

  it('узел на двух связях встаёт между ними', () => {
    const layout = layoutTopology({
      left: [node(LEFT_A, 'альфа'), node(LEFT_B, 'бета')],
      right: [node(RIGHT_A, 'Витрина')],
      edges: [edge(LEFT_A, RIGHT_A), edge(LEFT_B, RIGHT_A)],
    });

    const left = layout.nodes.filter((item) => item.side === 'left');
    const right = layout.nodes.find((item) => item.side === 'right')!;

    expect(right.y).toBe((left[0]!.y + left[1]!.y) / 2);
  });

  it('рёбра знают координаты обоих концов', () => {
    const layout = layoutTopology({
      left: [node(LEFT_A, 'альфа')],
      right: [node(RIGHT_A, 'Витрина')],
      edges: [edge(LEFT_A, RIGHT_A)],
    });

    const left = layout.nodes.find((item) => item.side === 'left')!;
    const right = layout.nodes.find((item) => item.side === 'right')!;

    expect(layout.edges).toEqual([
      expect.objectContaining({
        leftId: LEFT_A,
        rightId: RIGHT_A,
        from: { x: left.x, y: left.y },
        to: { x: right.x, y: right.y },
        label: 'Прод',
      }),
    ]);
  });

  it('одинаковые данные дают одинаковые координаты', () => {
    // Детерминированность здесь не эстетика: без неё раскладку нельзя
    // проверить тестом, а карта прыгала бы при каждой перерисовке.
    const graph: TopologyGraph = {
      left: [node(LEFT_A, 'альфа'), node(LEFT_B, 'бета')],
      right: [node(RIGHT_A, 'Витрина'), node(RIGHT_B, 'Портал')],
      edges: [edge(LEFT_A, RIGHT_A), edge(LEFT_B, RIGHT_B)],
    };

    expect(layoutTopology(graph)).toEqual(layoutTopology(graph));
  });

  it('правый узел без рёбер в раскладку не попадает', () => {
    const layout = layoutTopology({
      left: [node(LEFT_A, 'альфа')],
      right: [node(RIGHT_A, 'Витрина')],
      edges: [],
    });

    expect(layout.nodes.filter((item) => item.side === 'right')).toEqual([]);
  });
});
