import type { ProjectMetadata, SummaryCreate } from '@cairn/shared';

/** Значения полей формы создания саммари. */
export interface ISummaryFormValues {
  projectId: string;
  occurredOn: string;
  title: string;
  text: string;
}

/** Пропсы загрузки текстового файла. */
export interface IFileProps {
  /** Поле текста не пусто: замена спросит подтверждение. */
  hasText: boolean;
  /** Прочитанное и нормализованное содержимое. Имени файла здесь нет. */
  onText: (text: string) => void;
}

/** Пропсы формы создания саммари. */
export interface IProps {
  /** Цели: проекты, куда субъект может писать хронику. */
  projects: ProjectMetadata[];
  /**
   * Вызывается с проектом и готовым телом запроса.
   *
   * Проект отдельным аргументом, а не полем тела: он уходит адресом
   * ручки, и схема создания его не принимает (`strict`).
   */
  onSubmit: (projectId: string, input: SummaryCreate) => void;
  /** Отказ сервера. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
