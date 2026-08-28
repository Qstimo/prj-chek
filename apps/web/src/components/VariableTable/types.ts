import type { RevealResponse, Variable } from '@cairn/shared';

/** Пропсы таблицы переменных. */
export interface IProps {
  variables: Variable[];
  /** Право раскрывать значения — уровень чтения. */
  canReveal?: boolean;
  /** Право менять — уровень записи. */
  canWrite?: boolean;
  /** Раскрывает значение переменной. Каждый вызов попадает в журнал. */
  onReveal: (id: string) => Promise<RevealResponse>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  /** Открывает историю версий. */
  onHistory: (id: string) => void;
}
