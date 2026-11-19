import { describe, expect, it } from 'vitest';

import { SILENCE_INTERVALS, silenceGapOf } from './observation-gap';

const INTERVAL = 15;
const MINUTE = 60 * 1000;
const NOW = new Date('2026-11-19T12:00:00Z');

/** Момент за столько минут до «сейчас». */
function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * MINUTE);
}

describe('silenceGapOf', () => {
  it('свежее наблюдение пропуском не считается', () => {
    expect(silenceGapOf(minutesAgo(15), NOW, INTERVAL)).toBeNull();
  });

  it('тишина длиннее двух интервалов — пропуск', () => {
    // Два интервала, а не один: прогон может задержаться на свою
    // длительность, и объявлять пропуском каждую такую задержку значило
    // бы считать пропуском нормальную работу.
    expect(SILENCE_INTERVALS).toBe(2);

    const gap = silenceGapOf(minutesAgo(200), NOW, INTERVAL);

    expect(gap).toEqual({ startedAt: minutesAgo(200), endedAt: NOW });
  });

  it('ровно два интервала пропуском ещё не считаются', () => {
    expect(silenceGapOf(minutesAgo(30), NOW, INTERVAL)).toBeNull();
  });

  it('без прежних наблюдений пропуска нет: ничего и не обещали', () => {
    // Свежая установка не наблюдала никогда, и записывать ей пропуск с
    // начала времён означало бы сказать, что она что-то потеряла.
    expect(silenceGapOf(null, NOW, INTERVAL)).toBeNull();
  });

  it('выключенный цикл пропусков не знает вовсе', () => {
    // `0` означает «проверки только кнопкой»: регулярного наблюдения
    // никто не обещал, и тишина между нажатиями — не потеря.
    expect(silenceGapOf(minutesAgo(600), NOW, 0)).toBeNull();
    expect(silenceGapOf(minutesAgo(600), NOW, Number.NaN)).toBeNull();
  });

  it('наблюдение из будущего пропуском не считается', () => {
    // Часы машины могли сдвинуться назад: отрицательная тишина — не
    // пропуск, а расхождение времени, и выдумывать по ней отрезок нельзя.
    expect(silenceGapOf(new Date(NOW.getTime() + 60 * MINUTE), NOW, INTERVAL)).toBeNull();
  });
});
