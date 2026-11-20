import {
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  TranscriberKind,
} from '@cairn/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ModelServiceSettingsService,
  ResolvedModelService,
} from '../../model-services/model-service-settings.service';
import { DisabledTranscriber } from './disabled.transcriber';
import { RecordingStore } from './recording-store';
import { TRANSCRIBER_MAX_BYTES_ENV, TRANSCRIBER_MODEL_ENV } from './settings';
import { ModelServiceTranscriberSource } from './transcriber.source';
import { YandexSpeechKitTranscriber } from './yandex-speechkit.transcriber';

/** Разрешённая настройка рабочего внешнего узла. */
const RESOLVED: ResolvedModelService = {
  kind: ModelServiceKind.Transcriber,
  source: ModelServiceSource.Database,
  baseUrl: 'https://stt.iz-bazy.example',
  host: 'stt.iz-bazy.example',
  authScheme: ModelAuthScheme.ApiKey,
  model: 'general:rc',
  folder: 'каталог',
  placement: ModelServicePlacement.External,
  timeoutSeconds: 42,
  secret: 'ключ-из-базы',
  hasSecret: true,
  isEnabled: true,
  isOperational: true,
  blockedBy: null,
  updatedAt: null,
  updatedByLabel: null,
};

describe('источник адаптера расшифровки', () => {
  const resolve = vi.fn<ModelServiceSettingsService['resolve']>();
  const settings = { resolve } as unknown as ModelServiceSettingsService;
  let source: ModelServiceTranscriberSource;
  let savedModel: string | undefined;
  let savedMaxBytes: string | undefined;

  beforeEach(() => {
    resolve.mockReset();
    resolve.mockResolvedValue(RESOLVED);
    source = new ModelServiceTranscriberSource(settings, new RecordingStore());
    savedModel = process.env[TRANSCRIBER_MODEL_ENV];
    savedMaxBytes = process.env[TRANSCRIBER_MAX_BYTES_ENV];
  });

  afterEach(() => {
    for (const [name, value] of [
      [TRANSCRIBER_MODEL_ENV, savedModel],
      [TRANSCRIBER_MAX_BYTES_ENV, savedMaxBytes],
    ] as const) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('строит адаптер на каждый вызов, а не один раз', async () => {
    // Иначе правка настройки требовала бы перезапуска — ровно того, от
    // чего уходит этот дизайн.
    await source.current();
    await source.current();

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('узел берётся из настройки, а не из окружения', async () => {
    process.env[TRANSCRIBER_MODEL_ENV] = 'из-окружения';

    const transcriber = await source.current();

    expect(transcriber).toBeInstanceOf(YandexSpeechKitTranscriber);
    expect(transcriber.model).toBe('general:rc');
    expect(transcriber.host).toBe('stt.iz-bazy.example');
    expect(transcriber.isEnabled).toBe(true);
  });

  it('пределы потока остаются за окружением', async () => {
    // Граница та же, что у предложителя: «сколько мы готовы отправить» —
    // поведение нашего потока, и при смене провайдера оно не меняется.
    process.env[TRANSCRIBER_MAX_BYTES_ENV] = '1024';

    expect((await source.current()).maxSendBytes).toBe(1024);
  });

  it('ненастроенный узел даёт выключенный порт', async () => {
    resolve.mockResolvedValue({
      ...RESOLVED,
      secret: null,
      hasSecret: false,
      isOperational: false,
      blockedBy: 'secret_missing',
    });

    expect(await source.current()).toBeInstanceOf(DisabledTranscriber);
  });

  it('узел в контуре даёт выключенный порт, а не обещание', async () => {
    // Своей службы распознавания в сборке нет. Строка в базе при этом
    // сохраняется и показывается как есть: врать работающей кнопкой
    // нельзя, но и прятать настройку человека незачем.
    resolve.mockResolvedValue({
      ...RESOLVED,
      placement: ModelServicePlacement.Local,
      authScheme: ModelAuthScheme.None,
      baseUrl: 'http://whisper.internal:9000',
    });

    const transcriber = await source.current();

    expect(transcriber).toBeInstanceOf(DisabledTranscriber);
    expect(transcriber.isEnabled).toBe(false);
  });

  it('выключенный галочкой узел тоже выключен у порта', async () => {
    resolve.mockResolvedValue({
      ...RESOLVED,
      isEnabled: false,
      isOperational: false,
      blockedBy: 'disabled',
    });

    expect((await source.current()).isEnabled).toBe(false);
  });

  it('вид узла доезжает до адаптера размещением настройки', async () => {
    // Два перечня с одними значениями — цена того, что расшифровка жила
    // своим окружением; здесь они и сходятся.
    expect((await source.current()).kind).toBe(TranscriberKind.External);
  });
});
