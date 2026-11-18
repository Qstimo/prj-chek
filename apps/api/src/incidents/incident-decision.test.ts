import { HealthState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { decideIncident, IncidentAction } from './incident-decision';

/** Живой адрес непаузированного проекта без открытого инцидента. */
const CALM = {
  health: HealthState.Up,
  isPaused: false,
  isArchived: false,
  hasOpenIncident: false,
};

describe('решение об инциденте', () => {
  it('спокойное состояние ничего не меняет', () => {
    expect(decideIncident(CALM)).toBe(IncidentAction.None);
  });

  it('упавший адрес без инцидента открывает инцидент', () => {
    expect(decideIncident({ ...CALM, health: HealthState.Down })).toBe(IncidentAction.Open);
  });

  it('упавший адрес с открытым инцидентом дописывает ход, а не открывает второй', () => {
    // Второго инцидента быть не должно — иначе пуш повторялся бы каждые
    // пятнадцать минут. Но и «ничего не делать» было неправдой: причина
    // замерзала на открытии, и «HTTP 404» стоял в истории шесть суток,
    // хотя адрес давно отвечал другим.
    expect(decideIncident({ ...CALM, health: HealthState.Down, hasOpenIncident: true })).toBe(
      IncidentAction.Touch,
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
    expect(decideIncident({ ...CALM, health: HealthState.Down, isPaused: true })).toBe(
      IncidentAction.None,
    );
  });

  it('приостановленный проект всё равно закрывает открытый инцидент', () => {
    // Паузу могли поставить поверх уже начавшегося падения. «Отвечает
    // снова» — правда, и держать инцидент открытым вечно незачем.
    expect(decideIncident({ ...CALM, isPaused: true, hasOpenIncident: true })).toBe(
      IncidentAction.Resolve,
    );
  });

  it('архивный проект инцидента не открывает', () => {
    // Архив никто не чинит и не поднимает: снятый домен архивного проекта
    // будил человека пушем каждые четверть часа.
    expect(decideIncident({ ...CALM, health: HealthState.Down, isArchived: true })).toBe(
      IncidentAction.None,
    );
  });

  it('пауза и архив не мешают дописывать ход открытого падения', () => {
    // То же правило, что у закрытия: пауза и архив гасят только открытие.
    // Инцидент уже есть, адрес действительно не отвечает, и запись об
    // этом никого не будит — пуш уходит на открытии и закрытии.
    expect(
      decideIncident({ ...CALM, health: HealthState.Down, isPaused: true, hasOpenIncident: true }),
    ).toBe(IncidentAction.Touch);
    expect(
      decideIncident({ ...CALM, health: HealthState.Down, isArchived: true, hasOpenIncident: true }),
    ).toBe(IncidentAction.Touch);
  });

  it('архивный проект всё равно закрывает открытый инцидент', () => {
    // Проект могли заархивировать поверх начавшегося падения, и открытый
    // инцидент иначе остался бы висеть навсегда — то же правило, что у паузы.
    expect(decideIncident({ ...CALM, isArchived: true, hasOpenIncident: true })).toBe(
      IncidentAction.Resolve,
    );
  });
});
