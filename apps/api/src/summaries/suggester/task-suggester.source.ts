import { ModelServiceKind } from '@cairn/shared';
import { Injectable } from '@nestjs/common';

import {
  ModelServiceSettingsService,
  type ResolvedModelService,
} from '../../model-services/model-service-settings.service';
import { DisabledSuggester } from './disabled.suggester';
import { OpenAiCompatibleSuggester } from './openai-compatible.suggester';
import { suggesterSettings, type SuggesterSettings } from './settings';
import type { TaskSuggester, TaskSuggesterSource } from './task-suggester';

/**
 * Источник адаптера предложителя: строит его по действующей настройке.
 *
 * Адаптер рождается на каждый вызов, а не при старте процесса: иначе
 * смена настройки требовала бы перезапуска — ровно того, от чего уходит
 * этот дизайн (раздел 9.1). Кэша нет намеренно: один `SELECT` по
 * первичному ключу дешевле дефекта «я поменял настройку, а оно ещё
 * минуту работает по-старому» (раздел 9.2).
 *
 * Выбор один и тот же на всех путях: настройка рабочая — живой адаптер,
 * нерабочая — выключенный. Автоматического перехода на внешний узел при
 * отказе локального здесь нет и быть не может: источник узла не выбирает,
 * он его только читает.
 */
@Injectable()
export class ModelServiceTaskSuggesterSource implements TaskSuggesterSource {
  constructor(private readonly settings: ModelServiceSettingsService) {}

  async current(): Promise<TaskSuggester> {
    const resolved = await this.settings.resolve(ModelServiceKind.TaskSuggester);

    return resolved.isOperational
      ? new OpenAiCompatibleSuggester(suggesterSettingsOf(resolved))
      : new DisabledSuggester();
  }
}

/**
 * Настройки адаптера: узел — из разрешённой настройки, пределы — из
 * окружения.
 *
 * Граница ровно та, что названа дизайном (7.1): «как дойти, чем
 * представиться, что спросить, сколько ждать» — свойства узла и живут в
 * таблице; «сколько знаков мы готовы отправить и сколько задач принять» —
 * поведение нашего потока, и оно остаётся в окружении, потому что при
 * смене провайдера не меняется.
 *
 * Пустая строка в `apiKey` — не доливание из окружения, а то же
 * отсутствие ключа другим написанием: адаптер по схеме `none` или по
 * пустому ключу заголовка не ставит.
 */
function suggesterSettingsOf(resolved: ResolvedModelService): SuggesterSettings {
  const flow = suggesterSettings();

  return {
    placement: resolved.placement,
    baseUrl: resolved.baseUrl,
    apiKey: resolved.secret ?? '',
    authScheme: resolved.authScheme,
    model: resolved.model,
    folder: resolved.folder,
    timeoutSeconds: resolved.timeoutSeconds,
    maxChars: flow.maxChars,
    maxTasks: flow.maxTasks,
    host: resolved.host,
    isOff: !resolved.isEnabled,
    isEnabled: resolved.isOperational,
  };
}
