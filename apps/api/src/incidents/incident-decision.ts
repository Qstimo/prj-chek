import { HealthState } from '@cairn/shared';

/** Что сделать с инцидентом адреса по итогам проверки. */
export enum IncidentAction {
  /** Открыть новый: адрес упал, и об этом ещё не сообщали. */
  Open = 'open',
  /** Закрыть открытый: адрес ответил. */
  Resolve = 'resolve',
  /** Ничего не делать. */
  None = 'none',
}

/** Состояние адреса на момент решения. */
export interface AddressVerdict {
  /** `null` — адрес ещё не проверялся либо проверка не состоялась. */
  health: HealthState | null;
  /** Проект приостановлен: намеренно отключённый не аварийный (ТЗ 6). */
  isPaused: boolean;
  /** Есть ли уже открытый инцидент у этого адреса. */
  hasOpenIncident: boolean;
}

/**
 * Решает судьбу инцидента адреса (дизайн уведомлений, раздел 5).
 *
 * Пауза гасит только открытие, но не закрытие: её могли поставить поверх
 * уже начавшегося падения, и «отвечает снова» в этом случае — правда.
 * Обратное правило оставило бы инцидент открытым навсегда.
 */
export function decideIncident(verdict: AddressVerdict): IncidentAction {
  if (verdict.health === null) {
    return IncidentAction.None;
  }

  if (verdict.health === HealthState.Down) {
    if (verdict.isPaused || verdict.hasOpenIncident) {
      return IncidentAction.None;
    }

    return IncidentAction.Open;
  }

  return verdict.hasOpenIncident ? IncidentAction.Resolve : IncidentAction.None;
}
