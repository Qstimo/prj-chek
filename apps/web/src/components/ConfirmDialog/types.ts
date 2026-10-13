import type { ReactNode } from 'react';

/** Пропсы подтверждения действия. */
export interface IProps {
  /** Имя диалога для читалок: что именно подтверждается. */
  label: string;
  /** Подпись утверждающей кнопки: «Закрыть», «Да, убрать». */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Вопрос и его последствия. */
  children: ReactNode;
}
