import { EnvironmentKind, ProjectLifecycle, StatusIndicator, type ServerMap } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { layoutServerGraph } from './layout';

const SERVER_A = '11111111-1111-1111-1111-111111111111';
const SERVER_B = '22222222-2222-2222-2222-222222222222';
const PROJECT_A = '33333333-3333-3333-3333-333333333333';
const PROJECT_B = '44444444-4444-4444-4444-444444444444';

function server(id: string, name: string): ServerMap['servers'][number] {
  return {
    id,
    name,
    owner: null,
    indicator: StatusIndicator.Ok,
    paidUntil: null,
    warnings: [],
  };
}

function project(id: string, name: string): ServerMap['projects'][number] {
  return {
    id,
    name,
    lifecycle: ProjectLifecycle.Active,
    indicator: StatusIndicator.Ok,
  };
}

function edge(serverId: string, projectId: string): ServerMap['edges'][number] {
  return {
    serverId,
    projectId,
    environments: [
      { id: `${serverId}-${projectId}`, name: 'Прод', kind: EnvironmentKind.Production },
    ],
  };
}

describe('раскладка карты размещения', () => {
  it('пустая карта не занимает места', () => {
    const layout = layoutServerGraph({ servers: [], projects: [], edges: [] });

    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });

  it('серверы стоят колонкой: один X, разный Y', () => {
    // Порядок задаёт API (сортировка по имени), раскладка его сохраняет:
    // вторая сортировка была бы вторым местом, где порядок можно изменить.
    const layout = layoutServerGraph({
      servers: [server(SERVER_A, 'альфа'), server(SERVER_B, 'бета')],
      projects: [],
      edges: [],
    });

    const machines = layout.nodes.filter((node) => node.kind === 'server');

    expect(machines.map((node) => node.label)).toEqual(['альфа', 'бета']);
    expect(new Set(machines.map((node) => node.x)).size).toBe(1);
    expect(machines[0]!.y).toBeLessThan(machines[1]!.y);
  });

  it('проекты стоят правее своих машин', () => {
    const layout = layoutServerGraph({
      servers: [server(SERVER_A, 'альфа')],
      projects: [project(PROJECT_A, 'Витрина')],
      edges: [edge(SERVER_A, PROJECT_A)],
    });

    const machine = layout.nodes.find((node) => node.kind === 'server')!;
    const target = layout.nodes.find((node) => node.kind === 'project')!;

    expect(target.x).toBeGreaterThan(machine.x);
  });

  it('проект на двух машинах встаёт между ними', () => {
    const layout = layoutServerGraph({
      servers: [server(SERVER_A, 'альфа'), server(SERVER_B, 'бета')],
      projects: [project(PROJECT_A, 'Витрина')],
      edges: [edge(SERVER_A, PROJECT_A), edge(SERVER_B, PROJECT_A)],
    });

    const machines = layout.nodes.filter((node) => node.kind === 'server');
    const target = layout.nodes.find((node) => node.kind === 'project')!;

    expect(target.y).toBe((machines[0]!.y + machines[1]!.y) / 2);
  });

  it('рёбра знают координаты обоих концов', () => {
    const layout = layoutServerGraph({
      servers: [server(SERVER_A, 'альфа')],
      projects: [project(PROJECT_A, 'Витрина')],
      edges: [edge(SERVER_A, PROJECT_A)],
    });

    const machine = layout.nodes.find((node) => node.kind === 'server')!;
    const target = layout.nodes.find((node) => node.kind === 'project')!;

    expect(layout.edges).toEqual([
      expect.objectContaining({
        serverId: SERVER_A,
        projectId: PROJECT_A,
        from: { x: machine.x, y: machine.y },
        to: { x: target.x, y: target.y },
        label: 'Прод',
      }),
    ]);
  });

  it('одинаковые данные дают одинаковые координаты', () => {
    // Детерминированность здесь не эстетика: без неё раскладку нельзя
    // проверить тестом, а карта прыгала бы при каждой перерисовке.
    const map: ServerMap = {
      servers: [server(SERVER_A, 'альфа'), server(SERVER_B, 'бета')],
      projects: [project(PROJECT_A, 'Витрина'), project(PROJECT_B, 'Портал')],
      edges: [edge(SERVER_A, PROJECT_A), edge(SERVER_B, PROJECT_B)],
    };

    expect(layoutServerGraph(map)).toEqual(layoutServerGraph(map));
  });

  it('проект без рёбер в раскладку не попадает', () => {
    const layout = layoutServerGraph({
      servers: [server(SERVER_A, 'альфа')],
      projects: [project(PROJECT_A, 'Витрина')],
      edges: [],
    });

    expect(layout.nodes.filter((node) => node.kind === 'project')).toEqual([]);
  });
});
