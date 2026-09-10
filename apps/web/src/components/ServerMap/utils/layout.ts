import type { ServerMap, StatusIndicator } from '@cairn/shared';

import { COLUMN_X, NODE_STEP_Y, PADDING } from '../constants';

/** Узел карты с посчитанными координатами. */
export interface LayoutNode {
  id: string;
  kind: 'server' | 'project';
  label: string;
  /** Подпись под именем: владелец машины либо ничего. */
  hint: string | null;
  indicator: StatusIndicator;
  x: number;
  y: number;
}

/** Ребро карты с координатами обоих концов. */
export interface LayoutEdge {
  serverId: string;
  projectId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Какие окружения проекта живут на этой машине. */
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
 * Раскладка графа «серверы → проекты».
 *
 * Детерминированная: серверы колонкой слева с равным шагом в порядке,
 * пришедшем от API, проекты — правее, каждый по среднему Y своих машин.
 * Никакой физики и никакой случайности: иначе раскладку нельзя проверить
 * тестом, а карта прыгала бы при каждой перерисовке.
 *
 * Проекты без рёбер не размещаются: карта отвечает на вопрос «что упадёт
 * вместе с этой машиной», а не «какие вообще есть проекты».
 */
export function layoutServerGraph(map: ServerMap): Layout {
  const serverY = new Map<string, number>();

  const serverNodes: LayoutNode[] = map.servers.map((server, index) => {
    const y = PADDING + index * NODE_STEP_Y;
    serverY.set(server.id, y);

    return {
      id: server.id,
      kind: 'server',
      label: server.name,
      hint: server.owner,
      indicator: server.indicator,
      x: COLUMN_X.server,
      y,
    };
  });

  const projectNodes: LayoutNode[] = [];
  const projectY = new Map<string, number>();

  for (const project of map.projects) {
    const owners = map.edges
      .filter((edge) => edge.projectId === project.id)
      .map((edge) => serverY.get(edge.serverId))
      .filter((y): y is number => y !== undefined);

    if (owners.length === 0) {
      continue;
    }

    const y = owners.reduce((sum, value) => sum + value, 0) / owners.length;
    projectY.set(project.id, y);

    projectNodes.push({
      id: project.id,
      kind: 'project',
      label: project.name,
      hint: null,
      indicator: project.indicator,
      x: COLUMN_X.project,
      y,
    });
  }

  const edges: LayoutEdge[] = map.edges.flatMap((edge) => {
    const from = serverY.get(edge.serverId);
    const to = projectY.get(edge.projectId);

    if (from === undefined || to === undefined) {
      return [];
    }

    return [
      {
        serverId: edge.serverId,
        projectId: edge.projectId,
        from: { x: COLUMN_X.server, y: from },
        to: { x: COLUMN_X.project, y: to },
        label: edge.environments.map((environment) => environment.name).join(', '),
      },
    ];
  });

  const nodes = [...serverNodes, ...projectNodes];

  return {
    nodes,
    edges,
    width: nodes.length === 0 ? 0 : COLUMN_X.project + PADDING,
    height: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.y)) + PADDING,
  };
}
