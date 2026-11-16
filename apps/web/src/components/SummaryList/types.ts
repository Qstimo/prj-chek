import type { SummaryListItem } from '@cairn/shared';

/** Пропсы истории саммари. */
export interface IProps {
  /** Строки истории, свежие сверху: порядок задаёт сервер. */
  items: SummaryListItem[];
}
