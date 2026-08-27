import type { GrantMatrixRow } from '@cairn/shared';

import type { GrantChange } from '@/api/grant-change';

export type { GrantChange };

/** Строка матрицы: субъект с выдачами либо без них. */
export interface MatrixSubject {
  subjectId: string;
  subjectLabel: string;
  isRevoked: boolean;
  levels: GrantMatrixRow['levels'];
}

/** Пропсы матрицы доступов. */
export interface IProps {
  /** Все субъекты, которым можно выдать доступ, включая тех, у кого его нет. */
  rows: MatrixSubject[];
  onChange: (change: GrantChange) => void;
}
