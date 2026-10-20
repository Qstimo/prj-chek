import type { HealthState } from '@cairn/shared';
import { Injectable, Logger } from '@nestjs/common';

import { decideIncident, IncidentAction } from './incident-decision';
import { IncidentsRepository } from './incidents.repository';

/** Состояние адреса на входе сведения. */
export interface AddressState {
  domainId: string;
  /** Имя адреса: оно же попадёт в заголовок уведомления. */
  name: string;
  projectId: string;
  projectName: string;
  environmentName: string;
  isPaused: boolean;
  health: HealthState | null;
  healthError: string | null;
}

/** Что случилось с инцидентом. */
export enum IncidentEventKind {
  Opened = 'opened',
  Resolved = 'resolved',
}

/**
 * Событие инцидента — всё, что нужно уведомителю.
 *
 * Имена проекта и окружения кладутся в событие, а не вычитываются
 * уведомителем: иначе он знал бы о схеме базы, и подключение второго
 * канала потребовало бы повторить эти запросы.
 */
export interface IncidentEvent {
  kind: IncidentEventKind;
  domainId: string;
  address: string;
  projectId: string;
  projectName: string;
  environmentName: string;
  /** Причина на момент падения. */
  cause: string | null;
  startedAt: Date;
  resolvedAt: Date | null;
}

/**
 * Сводит состояние адресов в инциденты (дизайн уведомлений, раздел 5).
 *
 * Про уведомления не знает ничего: отдаёт события, а кому их разослать —
 * забота уведомителя. Поэтому второй канал подключается, не трогая это
 * место.
 */
@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(private readonly repository: IncidentsRepository) {}

  /** Применяет правило к каждому адресу и возвращает случившиеся события. */
  async reconcile(states: AddressState[]): Promise<IncidentEvent[]> {
    const open = await this.repository.openByDomain();
    const events: IncidentEvent[] = [];
    const now = new Date();

    for (const state of states) {
      const action = decideIncident({
        health: state.health,
        isPaused: state.isPaused,
        hasOpenIncident: open.has(state.domainId),
      });

      if (action === IncidentAction.None) {
        continue;
      }

      try {
        // Отказ одного адреса не прерывает обход — то же правило, что
        // у прогона проверок.
        if (action === IncidentAction.Open) {
          const incident = await this.repository.open(state.domainId, state.healthError);

          events.push(eventOf(IncidentEventKind.Opened, state, incident));
          continue;
        }

        const incident = await this.repository.resolve(state.domainId, now);

        if (incident) {
          events.push(eventOf(IncidentEventKind.Resolved, state, incident));
        }
      } catch (cause) {
        this.logger.warn(`Инцидент адреса ${state.name} не записан: ${cause}`);
      }
    }

    return events;
  }
}

/**
 * Собирает событие из состояния адреса и строки инцидента.
 *
 * Причина берётся из строки, а не из состояния: у ответившего адреса
 * причины нет по определению, и событие закрытия с пустой причиной
 * противоречило бы описанию поля.
 */
function eventOf(
  kind: IncidentEventKind,
  state: AddressState,
  incident: { startedAt: Date; resolvedAt: Date | null; cause: string | null },
): IncidentEvent {
  return {
    kind,
    domainId: state.domainId,
    address: state.name,
    projectId: state.projectId,
    projectName: state.projectName,
    environmentName: state.environmentName,
    cause: incident.cause,
    startedAt: incident.startedAt,
    resolvedAt: incident.resolvedAt,
  };
}
