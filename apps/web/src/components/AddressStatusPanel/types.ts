import type { DomainStatus, StatusWarning } from '@cairn/shared';

/** Пропсы панели разбора адреса. */
export interface IProps {
  projectId: string;
  /** Разбираемый адрес; `null` — панель закрыта и история не запрашивается. */
  address: DomainStatus | null;
  /**
   * Предупреждения проекта целиком.
   *
   * Панель отбирает свои по имени адреса: предметом предупреждения служит
   * именно имя (`warningsOf` в проекции статуса), и второго ключа у них
   * нет. Отбор здесь, а не снаружи, чтобы правило отбора было одно.
   */
  warnings: StatusWarning[];
  onClose: () => void;
}
