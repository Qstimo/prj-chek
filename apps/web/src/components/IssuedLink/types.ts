import type { IssuedLinkResponse } from '@cairn/shared';

/** Пропсы блока с выданной ссылкой. */
export interface IProps {
  link: IssuedLinkResponse;
  /** Что за ссылка: приглашение или сброс пароля. */
  title: string;
}
