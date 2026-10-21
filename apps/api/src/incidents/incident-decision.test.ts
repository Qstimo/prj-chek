import { HealthState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { decideIncident, IncidentAction } from './incident-decision';

/** Живой адрес непаузированного проекта без открытого инцидента. */
const CALM = { health: HealthState.Up, isPaused: false, hasOpenIncident: false };

describe('решение об инциденте', () => {
  it('спокойное состояние ничего не меняет', () => {
    expect(decideIncident(CALM)).toBe(IncidentAction.None);
  });

  it('упавший адрес без инцидента открывает инцидент', () => {
    expect(decideIncident({ ...CALM, health: HealthState.Down })).toBe(IncidentAction.Open);
  });

  it('упавший адрес с открытым инцидентом не открывает второй', () => {
    // Иначе пуш повторялся бы каждые пятнадцать минут.
    expect(decideIncident({ ...CALM, health: HealthState.Down, hasOpenIncident: true })).toBe(
      IncidentAction.None,
    );
  });

  it('ответивший адрес закрывает открытый инцидент', () => {
    expect(decideIncident({ ...CALM, hasOpenIncident: true })).toBe(IncidentAction.Resolve);
  });

  it('непроверенный адрес не трогает ничего', () => {
    // Отсутствие результата — не падение, и уведомлять о собственной
    // слепоте система не должна.
    expect(decideIncident({ ...CALM, health: null })).toBe(IncidentAction.None);
    expect(decideIncident({ ...CALM, health: null, hasOpenIncident: true })).toBe(
      IncidentAction.None,
    );
  });

  it('приостановленный проект инцидента не открывает', () => {
    // ТЗ 6: намеренно отключённый проект не выглядит аварийным.
    expect(
      decideIncident({ health: HealthState.Down, isPaused: true, hasOpenIncident: false }),
    ).toBe(IncidentAction.None);
  });

  it('приостановленный проект всё равно закрывает открытый инцидент', () => {
    // Паузу могли поставить поверх уже начавшегося падения. «Отвечает
    // снова» — правда, и держать инцидент открытым вечно незачем.
    expect(decideIncident({ health: HealthState.Up, isPaused: true, hasOpenIncident: true })).toBe(
      IncidentAction.Resolve,
    );
  });
});
