import type { ReleaseSummaryRow } from '@cairn/shared';

/** Пропсы сводки релизов. */
export interface IProps {
  /** Строки в порядке, пришедшем от сервера: он уже упорядочен. */
  summary: ReleaseSummaryRow[];
}
