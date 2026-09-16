import type { PublicLink } from '@cairn/shared';

/** Пропсы панели публичной ссылки. */
export interface IProps {
  /** Действующая ссылка либо её отсутствие. */
  link: PublicLink | null;
  /** Публикация — право суперадмина. */
  isSuperadmin: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  isPending?: boolean;
  /** Отказ сервера: показывается под содержимым панели. */
  error?: string;
}
