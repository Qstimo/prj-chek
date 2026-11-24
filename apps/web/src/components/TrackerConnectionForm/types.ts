import type { TrackerConnection, TrackerConnectionUpdate } from '@cairn/shared';

/** Черновик формы: правки накапливаются в памяти до «Сохранить». */
export interface TrackerFormValues {
  workspaceId: string;
  isEnabled: boolean;
  /** Вписанный токен. Пусто означает «не менять»: сервер его не отдаёт. */
  secret: string;
  /** Нажато «Убрать токен»: уедет пустое значение, а не отсутствие поля. */
  isSecretCleared: boolean;
}

/** Пропсы формы подключения трекера. */
export interface IProps {
  connection: TrackerConnection;
  /** Сохранить подключение целиком. */
  onSave: (input: TrackerConnectionUpdate) => void;
  /** Закрыть форму без сохранения. */
  onClose: () => void;
  /** Отказ сервера: показывается рядом с кнопкой. */
  error?: string;
  isSubmitting?: boolean;
}

/** Пропсы поля токена. */
export interface ISecretFieldProps {
  /** Задан ли токен сейчас: на экране об этом сказано словами. */
  hasSecret: boolean;
  value: string;
  isCleared: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
}
