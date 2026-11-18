import type { SummaryDetail, TranscriptionJob } from '@cairn/shared';

/** Пропсы блока записи созвона. */
export interface IProps {
  /** Дорожка саммари; `null` — слушать нечего (дизайн, 3.5). */
  recording: SummaryDetail['recording'];
  /**
   * Последняя расшифровка этого саммари.
   *
   * Нужна двум вещам: назвать состояние, пока работа идёт, и не предлагать
   * повтор там, где уникум в базе его всё равно не пропустит.
   */
  transcription: TranscriptionJob | null;
  /**
   * Адрес дорожки.
   *
   * Собирает экран, а не компонент: ручка живёт под проектом, а проект
   * здесь не спрашивается — он и так известен тому, кто читал деталь.
   */
  src: string;
  onRetry: () => void;
  isRetrying: boolean;
  /** Отказ повтора: `409` о идущей расшифровке или о пропавшей записи. */
  retryError?: string;
}
