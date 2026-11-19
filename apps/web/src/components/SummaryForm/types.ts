import type { ProjectMetadata, SummaryCreate, TranscriberInfo } from '@cairn/shared';

import type { SummarySource } from './constants';
import type { IReadRecording } from './readRecording';

/** Значения полей формы создания саммари. */
export interface ISummaryFormValues {
  projectId: string;
  occurredOn: string;
  title: string;
  text: string;
  /** Чем человек даёт текст: вставляет, грузит файлом или записью. */
  source: SummarySource;
}

/** Паспорт будущего саммари: дата и заголовок записи хроники. */
export interface ITranscriptionPassport {
  occurredOn: string;
  title: string;
}

/**
 * Загрузка записи, если она есть на этой установке.
 *
 * Одним необязательным пропсом, а не четырьмя: настройки, отправка,
 * процент и отказ приходят вместе или не приходят вовсе, и форма без
 * этого пропса работает ровно так, как работала в первой итерации.
 */
export interface IRecordingSupport {
  /** Настройки службы: нужны подписи, проверкам и списку форматов. */
  transcriber: TranscriberInfo;
  onSubmit: (
    projectId: string,
    passport: ITranscriptionPassport,
    recording: IReadRecording,
  ) => void;
  /** Процент отправки; `undefined` — отправки нет (дизайн, 8.2). */
  percent?: number;
  /** Прервать отправку: ждать двадцать минут молча человек не должен. */
  onCancel?: () => void;
  /** Отказ сервера на загрузку, объяснённый по коду. */
  error?: string;
}

/** Пропсы паспорта саммари: три поля, одинаковые у всех способов. */
export interface IPassportProps {
  projects: ProjectMetadata[];
  values: Pick<ISummaryFormValues, 'projectId' | 'occurredOn' | 'title'>;
  onChange: (key: 'projectId' | 'occurredOn' | 'title', value: string) => void;
}

/** Пропсы выбора способа дать текст. */
export interface ISourceProps {
  source: SummarySource;
  text: string;
  /** Загрузка записи; нет пропса — нет и выбора способа. */
  recording?: IRecordingSupport;
  onSource: (source: SummarySource) => void;
  onText: (text: string) => void;
  onPick: (recording: IReadRecording | undefined) => void;
}

/** Пропсы загрузки текстового файла. */
export interface IFileProps {
  /** Поле текста не пусто: замена спросит подтверждение. */
  hasText: boolean;
  /** Прочитанное и нормализованное содержимое. Имени файла здесь нет. */
  onText: (text: string) => void;
}

/** Пропсы выбора записи созвона. */
export interface IRecordingProps extends Omit<IRecordingSupport, 'onSubmit'> {
  /** Проверенная запись либо `undefined` — выбора нет или он негоден. */
  onPick: (recording: IReadRecording | undefined) => void;
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
  /** Третий способ дать текст; нет пропса — нет и способа. */
  recording?: IRecordingSupport;
  /** Отказ сервера. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
