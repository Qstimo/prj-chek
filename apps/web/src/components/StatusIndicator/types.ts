import type { StatusIndicator } from '@cairn/shared';

/** Пропсы индикатора статуса. */
export interface IProps {
  indicator: StatusIndicator;
  /** Контекстная подпись, например срок продления вместо доступности. */
  label?: string;
  title?: string;
}
