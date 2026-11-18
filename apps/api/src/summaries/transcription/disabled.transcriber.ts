import {
  DEFAULT_MAX_SEND_BYTES,
  SERVICE_AUDIO_TYPES,
  TRANSCRIBER_DISABLED,
  TranscriberKind,
} from '@cairn/shared';

import {
  TranscriberFailure,
  type Transcriber,
  type TranscriptionAnswer,
  type TranscriptionInput,
} from './transcriber';

/**
 * Порт выключен: расшифровка не настроена (дизайн, 7.4).
 *
 * Нужен, потому что система self-hosted и обязана работать без внешних
 * зависимостей: установка, где расшифровка не настроена, остаётся
 * полностью рабочей — текст вставляется руками или загружается текстовым
 * файлом, задачи набираются, релиз формируется. Кнопки «Загрузить запись»
 * при выключенном порте нет вовсе, а на её месте одна строка «Расшифровка
 * записи не настроена»: предложить загрузить файл, который никуда не
 * поедет, значит предложить впустую.
 *
 * В сеть не ходит ни при каких условиях: это и проверяется тестом.
 */
export class DisabledTranscriber implements Transcriber {
  readonly kind = TranscriberKind.External;
  readonly model = '';
  /** Называть узел, куда ничего не уходит, значило бы врать подписью. */
  readonly host = null;
  /** Предел нужен и выключенному: по нему объясняется отказ по размеру. */
  readonly maxSendBytes = DEFAULT_MAX_SEND_BYTES;
  readonly serviceTypes = [...SERVICE_AUDIO_TYPES];
  readonly isEnabled = false;

  /** Аргументы объявлены, но не читаются: запись наружу не уходит вовсе. */
  async start(_input: TranscriptionInput, _signal: AbortSignal): Promise<TranscriptionAnswer> {
    throw this.disabled();
  }

  async poll(_externalId: string, _signal: AbortSignal): Promise<TranscriptionAnswer> {
    throw this.disabled();
  }

  /**
   * Забыть нечего, и это не отказ.
   *
   * `forget` зовётся по следам успешной расшифровки; у выключенного порта
   * таких следов нет, и ронять им уборку незачем — он и так best effort.
   */
  async forget(_externalId: string): Promise<void> {
    return undefined;
  }

  /** Один и тот же отказ на оба обмена: причина у них одна. */
  private disabled(): TranscriberFailure {
    return new TranscriberFailure(
      TRANSCRIBER_DISABLED,
      'Расшифровка записи не настроена: обратитесь к администратору.',
    );
  }
}
