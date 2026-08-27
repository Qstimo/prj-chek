import type { AuditEntry } from '@cairn/shared';

/** Пропсы таблицы журнала. */
export interface IProps {
  entries: AuditEntry[];
}
