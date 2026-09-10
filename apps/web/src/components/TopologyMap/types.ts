import type { StatusIndicator } from '@cairn/shared';
import type { ReactNode } from 'react';

/** Узел графа до раскладки. */
export interface TopologyNodeInput {
  id: string;
  label: string;
  /** Подпись под именем: владелец машины или домена. */
  hint: string | null;
  indicator: StatusIndicator;
}

/** Связь между левым и правым узлом. */
export interface TopologyEdgeInput {
  leftId: string;
  rightId: string;
  /** Что именно связывает узлы: окружения или поддомены. */
  label: string;
}

/**
 * Граф в нейтральных терминах.
 *
 * «Левые» и «правые» вместо серверов и проектов: карта серверов и карта
 * доменов различаются только тем, что подставлено в узлы, и второе ядро
 * ради этой разницы завело бы две копии зума и выделения.
 */
export interface TopologyGraph {
  left: TopologyNodeInput[];
  right: TopologyNodeInput[];
  edges: TopologyEdgeInput[];
}

/** Пропсы карты топологии. */
export interface IProps {
  graph: TopologyGraph;
  /** Как называется вид левого узла в доступном имени кнопки. */
  leftKindLabel: string;
  /** Как называется вид правого узла. */
  rightKindLabel: string;
  /** Что показать, когда связей нет вовсе. */
  emptyText: string;
  /** Панель выделенного узла. */
  renderPanel: (selectedId: string, close: () => void) => ReactNode;
}
