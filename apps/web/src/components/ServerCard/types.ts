import type { ServerMap } from '@cairn/shared';

/** Пропсы панели узла карты. */
export interface IProps {
  map: ServerMap;
  /** Выделенный узел: машина или проект. */
  selectedId: string;
  onClose: () => void;
}
