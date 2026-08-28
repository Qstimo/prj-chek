import type { ImportResult } from '@cairn/shared';

/** Пропсы панели импорта и выгрузки. */
export interface IProps {
  /** Импорт — уровень записи. */
  canWrite?: boolean;
  /** Выгрузка — уровень чтения. */
  canReveal?: boolean;
  onImport: (content: string) => void;
  /** Возвращает текст `.env`. Каждый вызов попадает в журнал. */
  onExport: () => Promise<string>;
  importResult?: ImportResult;
  error?: string;
  isPending?: boolean;
}
