import type { ModelServiceSettings } from '@cairn/shared';
import type { ReactNode } from 'react';

/** Пропсы карточки узла службы модели. */
export interface IProps {
  settings: ModelServiceSettings;
  /** Открыть форму правки. */
  onEdit: () => void;
  /** Проверить связь живым вызовом. */
  onProbe: () => void;
  /** Сбросить настройку к окружению. */
  onClear: () => void;
  /** Исход последней проверки связи: карточка его только показывает. */
  probe?: ReactNode;
  /** Идёт ли проверка: кнопка на это время выключается. */
  isProbing?: boolean;
}

/** Пропсы строки настройки «подпись — значение». */
export interface IFieldProps {
  label: string;
  value: string;
}
