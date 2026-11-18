import type { TranscriptionJob } from '@cairn/shared';

/** Пропсы блока очереди расшифровок. */
export interface IProps {
  /** Незакрытые и неудавшиеся задачи, свежие сверху: порядок задаёт сервер. */
  jobs: TranscriptionJob[];
  /** Отменить: у извлечения это правда прерывает работу (дизайн, 2.3). */
  onCancel: (job: TranscriptionJob) => void;
  /** Расшифровать снова: только у задачи, за которой уже есть саммари. */
  onRetry: (job: TranscriptionJob) => void;
  /** Удалить задачу вместе с файлами. */
  onDelete: (job: TranscriptionJob) => void;
}

/** Пропсы одной строки очереди. */
export interface IRowProps extends Omit<IProps, 'jobs'> {
  job: TranscriptionJob;
  /** Сейчас: передаётся сверху, чтобы все строки считали от одного мига. */
  now: number;
}
