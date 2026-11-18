import { RECORDING_NEEDS_FFMPEG, SERVICE_AUDIO_TYPES } from '@cairn/shared';

import {
  ExtractionFailure,
  type AudioExtractor,
  type ExtractedAudio,
  type MediaProbe,
} from './extractor';

/**
 * Извлечение недоступно: `ffmpeg` нет либо он выключен настройкой.
 *
 * Объект, а не ветвление `if` в трёх местах вызова: выключенная
 * возможность обязана быть объектом — та же пара, что
 * `YandexSpeechKitTranscriber` и `DisabledTranscriber`, и по той же
 * причине (дизайн, 7.6).
 *
 * Отсутствие пакета и `CAIRN_RECORDING_FFMPEG=off` ведут себя одинаково, и
 * различать их в коде незачем: первое — обстоятельство, второе — решение
 * администратора не нагружать машину перекодированием, а человеку в обоих
 * случаях сказать надо одно и то же.
 *
 * Установка при этом остаётся **рабочей, только уже**: `acceptedTypes`
 * сужается до того, что служба берёт как есть, а видео получает названный
 * отказ. Это то же правило, что «без ключа порт выключен».
 */
export class UnavailableExtractor implements AudioExtractor {
  get isAvailable(): boolean {
    return false;
  }

  /** Называть битрейт, не умея перекодировать, значило бы соврать подписью. */
  get bitrate(): string | null {
    return null;
  }

  get acceptedTypes(): string[] {
    return [...SERVICE_AUDIO_TYPES];
  }

  probe(): Promise<MediaProbe> {
    return Promise.reject(this.failure());
  }

  extract(): Promise<ExtractedAudio> {
    return Promise.reject(this.failure());
  }

  /** Один отказ на оба метода: причина у них одна. */
  private failure(): ExtractionFailure {
    return new ExtractionFailure(
      RECORDING_NEEDS_FFMPEG,
      'Эта установка принимает только MP3, WAV и OGG: извлечение дорожки не настроено.',
    );
  }
}
