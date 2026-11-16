import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CHECK_TIMEOUT_SECONDS,
  DEFAULT_DNS_TRIES,
  DEFAULT_RDAP_CACHE_HOURS,
  cacheMsOf,
  timeoutMsOf,
  triesOf,
} from './settings';

describe('timeoutMsOf', () => {
  it('без настройки берёт умолчание', () => {
    expect(timeoutMsOf(undefined)).toBe(DEFAULT_CHECK_TIMEOUT_SECONDS * 1000);
  });

  it('читает секунды из настройки', () => {
    expect(timeoutMsOf('3')).toBe(3000);
  });

  it('мусор и ноль не выключают проверку, а возвращают умолчание', () => {
    // Проверка без предела ожидания повисла бы до конца прогона, а
    // выключателя у предела нет.
    expect(timeoutMsOf('скоро')).toBe(DEFAULT_CHECK_TIMEOUT_SECONDS * 1000);
    expect(timeoutMsOf('0')).toBe(DEFAULT_CHECK_TIMEOUT_SECONDS * 1000);
    expect(timeoutMsOf('-5')).toBe(DEFAULT_CHECK_TIMEOUT_SECONDS * 1000);
  });
});

describe('triesOf', () => {
  it('без настройки спрашивает DNS дважды', () => {
    // Одной попытки мало: потерянный UDP-пакет читался как «имени нет»,
    // и предупреждение о расхождении мигало на ровном месте.
    expect(triesOf(undefined)).toBe(DEFAULT_DNS_TRIES);
    expect(DEFAULT_DNS_TRIES).toBeGreaterThan(1);
  });

  it('читает число попыток', () => {
    expect(triesOf('4')).toBe(4);
  });

  it('мусор и ноль дают умолчание', () => {
    expect(triesOf('дважды')).toBe(DEFAULT_DNS_TRIES);
    expect(triesOf('0')).toBe(DEFAULT_DNS_TRIES);
  });
});

describe('cacheMsOf', () => {
  it('без настройки держит ответ реестра сутки', () => {
    expect(cacheMsOf(undefined)).toBe(DEFAULT_RDAP_CACHE_HOURS * 60 * 60 * 1000);
    expect(DEFAULT_RDAP_CACHE_HOURS).toBe(24);
  });

  it('читает часы из настройки', () => {
    expect(cacheMsOf('2')).toBe(2 * 60 * 60 * 1000);
  });

  it('ноль выключает кэш: так в тестах', () => {
    // В отличие от предела ожидания, выключатель здесь нужен: кэш —
    // ускорение, а не часть правила.
    expect(cacheMsOf('0')).toBe(0);
  });

  it('мусор даёт умолчание', () => {
    expect(cacheMsOf('сутки')).toBe(DEFAULT_RDAP_CACHE_HOURS * 60 * 60 * 1000);
  });
});
