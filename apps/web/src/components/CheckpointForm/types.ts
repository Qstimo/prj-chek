import type { RoadmapCheckpointCreate } from '@cairn/shared';

/** Пропсы формы чекпоинта. */
export interface IProps {
  /** Предзаполнение — например, заголовком записи хроники. */
  initialTitle?: string;
  onSubmit: (input: RoadmapCheckpointCreate) => void;
  /**
   * Чтение заголовка страницы по ссылке на задачу.
   *
   * Пропом, а не хуком внутри: форма остаётся презентационной и проверяется
   * без поднятия TanStack Query. Неудача — `null`, а не исключение.
   */
  onReadTitle?: (url: string) => Promise<string | null>;
  isSubmitting?: boolean;
  /** Отказ сервера: показывается под полем. */
  error?: string;
}
