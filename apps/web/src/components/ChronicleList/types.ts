import type { ChronicleDetail, ChronicleMetadata } from '@cairn/shared';

/** Пропсы ленты хроники. */
export interface IProps {
  entries: (ChronicleMetadata | ChronicleDetail)[];
  /** Есть ли право менять секцию. */
  canWrite?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  /** Поднять запись в чекпоинт: передаётся при праве записи в роадмап. */
  onPromote?: (id: string, title: string) => void;
  /** Поднять запись в документацию: при праве записи в документацию. */
  onPromoteToDoc?: (id: string, title: string, content: string) => void;
}
