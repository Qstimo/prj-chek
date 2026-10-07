import type { ProjectMetadata, StatusIndicator } from '@cairn/shared';
import type { ReactNode } from 'react';

/** Пропсы списка проектов. */
export interface IProps {
  projects: ProjectMetadata[];
  /**
   * Орган создания проекта.
   *
   * Слот, а не флаг: кнопка открывает выезжающую панель, и список
   * из-за этого не обязан становиться клиентским.
   */
  createSlot?: ReactNode;
  /** Индикатор по идентификатору проекта; отсутствие означает «статуса нет». */
  indicators?: Record<string, StatusIndicator>;
}
