import type { RevealResponse, VariableVersion } from '@cairn/shared';

/** Пропсы истории версий. */
export interface IProps {
  versions: VariableVersion[];
  /** Право отката — уровень записи. */
  canWrite?: boolean;
  /** Раскрывает историческую версию. Каждый вызов попадает в журнал. */
  onReveal: (versionNo: number) => Promise<RevealResponse>;
  onRollback: (versionNo: number) => void;
}
