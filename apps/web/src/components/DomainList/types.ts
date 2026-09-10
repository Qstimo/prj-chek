import type { DomainRow } from '@cairn/shared';

/** Пропсы реестра доменов. */
export interface IProps {
  domains: DomainRow[];
  /** Удаление корня. Занятый корень API не удалит. */
  onDelete: (id: string) => void;
}
