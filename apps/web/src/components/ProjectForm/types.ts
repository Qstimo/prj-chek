import type { ProjectLifecycle, ProjectUpdate } from '@cairn/shared';

/** Значения полей формы. */
export interface ProjectFormValues {
  name: string;
  purpose: string | null;
  stack: string | null;
  repoUrl: string | null;
  notes: string | null;
  lifecycle: ProjectLifecycle;
}

/** Пропсы формы проекта. */
export interface IProps {
  /** Текущие значения полей. */
  initial: ProjectFormValues;
  /**
   * Вызывается с изменёнными значениями.
   *
   * Тип общий для создания и правки: поля совпадают, различается только
   * обязательность названия, а форма и так не отправляет пустое.
   */
  onSubmit: (input: ProjectUpdate & { name: string }) => void;
  /** Сообщение об ошибке. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
