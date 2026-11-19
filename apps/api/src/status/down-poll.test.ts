import { describe, expect, it } from 'vitest';

import { DEFAULT_DOWN_POLL_SECONDS, downPollSecondsOf } from './down-poll';

describe('downPollSecondsOf', () => {
  it('без настройки опрашивает лежащее раз в минуту', () => {
    expect(downPollSecondsOf(undefined)).toBe(DEFAULT_DOWN_POLL_SECONDS);
  });

  it('`0` выключает частый опрос', () => {
    // В отличие от переспроса, у частого опроса выключатель нужен: он
    // ходит в сеть сам по себе, и установка за узким каналом вправе
    // ограничиться сводным прогоном.
    expect(downPollSecondsOf('0')).toBe(0);
  });

  it('мусор и отрицательное — умолчание, а не «никогда»', () => {
    expect(downPollSecondsOf('скоро')).toBe(DEFAULT_DOWN_POLL_SECONDS);
    expect(downPollSecondsOf('-30')).toBe(DEFAULT_DOWN_POLL_SECONDS);
  });

  it('дробное округляется: интервал задаётся целыми секундами', () => {
    expect(downPollSecondsOf('90.4')).toBe(90);
  });
});
