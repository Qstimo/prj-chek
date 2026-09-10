import type { DomainMap } from '@cairn/shared';

/** Пропсы панели узла карты доменов. */
export interface IProps {
  map: DomainMap;
  /** Выделенный узел: корень или проект. */
  selectedId: string;
  onClose: () => void;
}
