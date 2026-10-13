import type { ReactNode } from 'react';

/** Ширина контрола выбора. */
export enum SelectWidth {
  /** Поле формы: во всю ширину, как `TextField`. */
  Full = 'full',
  /** Клетка таблицы или орган в строке: по содержимому. */
  Auto = 'auto',
}

/** Пропсы контрола выбора. */
export interface IProps {
  value: string;
  onChange: (value: string) => void;
  /** Опции: контрол не навязывает их форму — она у каждого места своя. */
  children: ReactNode;
  /** Идентификатор для связи с видимой подписью через `htmlFor`. */
  id?: string;
  /** Подпись для читалок там, где видимой подписи рядом нет. */
  label?: string;
  /** Ширина; по умолчанию во всю. */
  width?: SelectWidth;
  isDisabled?: boolean;
}
