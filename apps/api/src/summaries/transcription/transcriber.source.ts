import { ModelServiceKind, ModelServicePlacement, TranscriberKind } from '@cairn/shared';
import { Injectable, Logger } from '@nestjs/common';

import {
  ModelServiceSettingsService,
  type ResolvedModelService,
} from '../../model-services/model-service-settings.service';
import { DisabledTranscriber } from './disabled.transcriber';
import { RecordingStore } from './recording-store';
import { transcriberSettings, type TranscriberSettings } from './settings';
import type { Transcriber, TranscriberSource } from './transcriber';
import { YandexSpeechKitTranscriber } from './yandex-speechkit.transcriber';

/**
 * Источник адаптера расшифровки: строит его по действующей настройке.
 *
 * Полный повтор устройства `ModelServiceTaskSuggesterSource`, и это не
 * копипаста, а одно правило, применённое к двум узлам: адаптер рождается
 * на вызов, кэша нет, выбор узла источнику не принадлежит — он его только
 * читает (дизайн настройки служб модели, 9.1 и 9.2).
 *
 * Место под `local` — ветка с выключенным портом: своей службы
 * распознавания в контуре в сборке нет, и обещать её настройкой, которая
 * ни на что не влияет, хуже, чем честно выключить. Поэтому выбор ветвится
 * по **размещению** узла, а не по имени провайдера: ветвление по имени
 * провайдера этот дизайн запрещает целиком.
 */
@Injectable()
export class ModelServiceTranscriberSource implements TranscriberSource {
  private readonly logger = new Logger(ModelServiceTranscriberSource.name);

  constructor(
    private readonly settings: ModelServiceSettingsService,
    private readonly store: RecordingStore,
  ) {}

  async current(): Promise<Transcriber> {
    const resolved = await this.settings.resolve(ModelServiceKind.Transcriber);

    if (!resolved.isOperational) {
      return new DisabledTranscriber();
    }

    if (resolved.placement === ModelServicePlacement.Local) {
      // Не отказ настройки, а отсутствие адаптера: строка в базе
      // сохранится, экран покажет её как есть, а порт останется
      // выключенным — врать работающей кнопкой нельзя.
      this.logger.log('Расшифровка: локальная служба не реализована, порт выключен');

      return new DisabledTranscriber();
    }

    return new YandexSpeechKitTranscriber(transcriberSettingsOf(resolved), this.store);
  }
}

/**
 * Настройки адаптера: узел — из разрешённой настройки, пределы — из
 * окружения.
 *
 * Граница та же, что у предложителя (дизайн, 7.1): «как дойти, чем
 * представиться, что спросить, сколько ждать» — свойства узла и живут в
 * таблице; предел отправки, предел загрузки, частота тика, битрейт дорожки
 * и терпение к `ffmpeg` — поведение **нашего** потока, и оно остаётся в
 * окружении, потому что при смене провайдера не меняется.
 *
 * `isOff` и `isEnabled` считаются от разрешённой настройки, а не от
 * переменной вида: решение «выключено» может прийти и галочкой на экране,
 * и `CAIRN_TRANSCRIBER=off`, и для адаптера это одно и то же состояние.
 */
function transcriberSettingsOf(resolved: ResolvedModelService): TranscriberSettings {
  const flow = transcriberSettings();

  return {
    ...flow,
    kind: resolved.placement === ModelServicePlacement.Local
      ? TranscriberKind.Local
      : TranscriberKind.External,
    baseUrl: resolved.baseUrl,
    apiKey: resolved.secret ?? '',
    authScheme: resolved.authScheme,
    model: resolved.model,
    folder: resolved.folder,
    timeoutSeconds: resolved.timeoutSeconds,
    host: resolved.host,
    isOff: !resolved.isEnabled,
    isEnabled: resolved.isOperational,
  };
}
