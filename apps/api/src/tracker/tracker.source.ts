import { TrackerKind } from '@cairn/shared';
import { Injectable } from '@nestjs/common';

import { DisabledTracker } from './disabled.tracker';
import type { Tracker, TrackerSource } from './tracker';
import {
  TRACKER_TIMEOUT_SECONDS,
  type TrackerSettings,
} from './tracker.settings';
import {
  TrackerConnectionService,
  type ResolvedTrackerConnection,
} from './tracker-connection.service';
import { WeeekTracker } from './weeek.tracker';

/**
 * Источник адаптера трекера: строит его по действующей настройке.
 *
 * Повтор устройства `ModelServiceTaskSuggesterSource` и
 * `ModelServiceTranscriberSource`, и это не копипаста, а одно правило,
 * применённое к третьему порту: адаптер рождается **на вызов**, кэша нет,
 * выбор вида источнику не принадлежит — он его только читает.
 *
 * Вида в сигнатуре `current()` нет: трекер на установку один (дизайн,
 * 10.1), и параметр здесь обещал бы выбор, которого ещё нет. Когда
 * появится второй вид, выбор ветвится **по значению перечня**, как у узлов
 * модели, а не по имени провайдера.
 */
@Injectable()
export class TrackerConnectionSource implements TrackerSource {
  constructor(private readonly connections: TrackerConnectionService) {}

  async current(): Promise<Tracker> {
    const resolved = await this.connections.resolve(TrackerKind.Weeek);

    if (!resolved.isOperational) {
      return new DisabledTracker();
    }

    return new WeeekTracker(settingsOf(resolved));
  }
}

/**
 * Настройки адаптера из разрешённого подключения.
 *
 * Предел ожидания — константа, а не поле подключения: это свойство нашего
 * обмена, а не провайдера (см. `tracker.settings.ts`). Токен берётся
 * открытым и здесь, и только здесь: дальше он живёт в приватном поле
 * адаптера.
 *
 * `secret ?? ''` недостижимо при `isOperational`: неполный токен уже
 * выключил бы порт выше. Пустая строка стоит затем, чтобы адаптер никогда
 * не получал `null` и не решал, что с ним делать.
 */
function settingsOf(resolved: ResolvedTrackerConnection): TrackerSettings {
  return {
    kind: resolved.kind,
    baseUrl: resolved.baseUrl,
    token: resolved.secret ?? '',
    host: resolved.host,
    workspaceId: resolved.workspaceId,
    timeoutSeconds: TRACKER_TIMEOUT_SECONDS,
    isEnabled: resolved.isOperational,
  };
}
