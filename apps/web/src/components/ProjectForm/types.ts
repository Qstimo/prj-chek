import type { ProjectLifecycle, ProjectUpdate } from '@cairn/shared';
import type { ReactNode } from 'react';

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
  /**
   * Поле платформ — слотом, а не вторым режимом формы.
   *
   * Форма держит значения в `useState(initial)` и с пропом не
   * ресинхронизируется: рисуй она чипы из своего состояния, в режиме
   * правки новая платформа не появилась бы до перемонтирования панели.
   * Платформы собирает и отправляет родитель; `projectUpdateSchema`
   * их и не принимает.
   */
  platformsSlot?: ReactNode;
}
