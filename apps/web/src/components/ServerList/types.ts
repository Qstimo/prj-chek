import type { ServerRow } from '@cairn/shared';

/** Пропсы реестра серверов. */
export interface IProps {
  servers: ServerRow[];
  /** Удаление сервера. Занятый сервер API не удалит. */
  onDelete: (id: string) => void;
}
