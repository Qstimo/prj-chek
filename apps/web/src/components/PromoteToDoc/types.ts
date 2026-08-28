import type { DocPageCreate } from '@cairn/shared';

/** Пропсы панели «В документацию». */
export interface IProps {
  /** Заголовок записи хроники — предзаполняет заголовок страницы. */
  entryTitle: string;
  /** Содержимое записи — предзаполняет содержимое страницы. */
  entryContent: string;
  onSubmit: (input: DocPageCreate) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string;
}
