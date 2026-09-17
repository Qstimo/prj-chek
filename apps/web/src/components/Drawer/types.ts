import type { ReactNode } from 'react';

/** Ширина выезжающей панели. */
export enum DrawerWidth {
  /** Форма в несколько полей. */
  Default = 'default',
  /** Панель с длинными формулировками — роадмап. */
  Wide = 'wide',
}

/** Пропсы выезжающей панели. */
export interface IProps {
  isOpen: boolean;
  onClose: () => void;
  /** Заголовок — он же имя диалога для читалок. */
  title: string;
  /** Ширина; по умолчанию узкая. */
  width?: DrawerWidth;
  children: ReactNode;
}
