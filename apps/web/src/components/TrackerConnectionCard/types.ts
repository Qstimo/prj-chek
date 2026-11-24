import type { TrackerConnection, TrackerProbeResult } from '@cairn/shared';
import type { ReactNode } from 'react';

/** Пропсы карточки подключения трекера. */
export interface IProps {
  connection: TrackerConnection;
  /** Открыть форму правки. */
  onEdit: () => void;
  /** Проверить связь живым вызовом: он ничего не создаёт и не стоит. */
  onProbe: () => void;
  /** Снять подключение целиком. */
  onRemove: () => void;
  /** Исход последней проверки: карточка его только показывает. */
  probe?: ReactNode;
  /** Идёт ли проверка: кнопка на это время выключается. */
  isProbing?: boolean;
}

/** Пропсы исхода проверки связи. */
export interface IProbeProps {
  result: TrackerProbeResult;
}

/** Пропсы строки настройки «подпись — значение». */
export interface IFieldProps {
  label: string;
  value: string;
}
