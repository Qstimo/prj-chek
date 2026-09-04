import type { ReactNode } from 'react';

/** Пропсы выезжающей панели. */
export interface IProps {
  isOpen: boolean;
  onClose: () => void;
  /** Заголовок — он же имя диалога для читалок. */
  title: string;
  children: ReactNode;
}
