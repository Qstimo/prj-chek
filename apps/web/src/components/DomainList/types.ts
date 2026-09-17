import type { DomainRow, DomainSubdomain } from '@cairn/shared';

/** Пропсы реестра доменов. */
export interface IProps {
  domains: DomainRow[];
  /** Удаление корня. Занятый корень API не удалит. */
  onDelete: (id: string) => void;
  /** Снятие адреса с окружения. Корень при этом остаётся в реестре. */
  onDeleteSubdomain: (subdomain: DomainSubdomain) => void;
}
