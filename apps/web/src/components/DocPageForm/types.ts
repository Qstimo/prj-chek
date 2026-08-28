import type { DocPageCreate } from '@cairn/shared';

/** Начальные значения формы страницы. */
export interface DocPageFormInitial {
  title: string;
  content: string;
}

/** Пропсы формы страницы. */
export interface IProps {
  /** Начальные значения. Отсутствие — форма создания. */
  initial?: DocPageFormInitial;
  onSubmit: (input: DocPageCreate) => void;
  error?: string;
  isSubmitting?: boolean;
}
