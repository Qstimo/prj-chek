import type { GrantMatrixRow } from '@cairn/shared';

import type { GrantChange } from '@/api/grant-change';

export type { GrantChange };

/** Строка матрицы: субъект с выдачами либо без них. */
export interface MatrixSubject {
  subjectId: string;
  subjectLabel: string;
  /**
   * Логин субъекта, если он человек.
   *
   * Имена не уникальны и правятся свободно, поэтому тёзок в этой таблице
   * различает только адрес — и он же идёт в подпись селекта. У машинных
   * субъектов адреса нет, и подписью остаётся метка.
   */
  subjectEmail?: string;
  isRevoked: boolean;
  /** Суперадмин обходит выдачи: селекты в его строке ничего не меняли бы. */
  isSuperadmin?: boolean;
  levels: GrantMatrixRow['levels'];
}

/** Пропсы матрицы доступов. */
export interface IProps {
  /** Все субъекты, которым можно выдать доступ, включая тех, у кого его нет. */
  rows: MatrixSubject[];
  onChange: (change: GrantChange) => void;
}
