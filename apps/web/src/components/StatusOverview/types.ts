import type { AddressIncidents, ProjectStatus } from '@cairn/shared';

/** Пропсы сводки проверок. */
export interface IProps {
  projectId?: string;
  /** Статус проекта целиком: окружения, адреса и три проверки у каждого. */
  status: ProjectStatus;
  /** Инциденты адресов; пусто — истории ещё нет либо доступа к ней нет. */
  incidents?: AddressIncidents[];
  incidentsPending?: boolean;
  incidentsError?: boolean;
  /** Открыть разбор адреса. */
  onSelect?: (domainId: string) => void;
}
