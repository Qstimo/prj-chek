import { describe, expect, it } from 'vitest';

import { DEFAULT_TRACKER_POLL_SECONDS, trackerPollSecondsOf } from './tracker-poll';

describe('trackerPollSecondsOf', () => {
  it('без настройки спрашивает трекер раз в пять минут', () => {
    expect(trackerPollSecondsOf(undefined)).toBe(DEFAULT_TRACKER_POLL_SECONDS);
  });

  it('`0` выключает цикл целиком', () => {
    // Так работают тесты и локальная разработка: с выключенным циклом в
    // чужой API не уходит ни один запрос.
    expect(trackerPollSecondsOf('0')).toBe(0);
  });

  it('мусор и отрицательное — умолчание, а не «никогда»', () => {
    // Выключение — решение человека, и выражается оно нулём. Опечатка в
    // переменной означала бы молчаливо остановленное наблюдение.
    expect(trackerPollSecondsOf('скоро')).toBe(DEFAULT_TRACKER_POLL_SECONDS);
    expect(trackerPollSecondsOf('-30')).toBe(DEFAULT_TRACKER_POLL_SECONDS);
  });

  it('пустая строка — тоже умолчание: compose передаёт необъявленное пустым', () => {
    // `${VAR:-}` в compose приходит пустой строкой, а не отсутствующей
    // переменной, и прочитать её как `0` значило бы выключить наблюдение у
    // всех, кто переменной не задавал.
    expect(trackerPollSecondsOf('')).toBe(DEFAULT_TRACKER_POLL_SECONDS);
  });

  it('дробное округляется: интервал задаётся целыми секундами', () => {
    expect(trackerPollSecondsOf('90.4')).toBe(90);
  });
});
