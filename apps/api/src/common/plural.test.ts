import { describe, expect, it } from 'vitest';

import { pluralOf } from './plural';

const MINUTES: [string, string, string] = ['минуту', 'минуты', 'минут'];

describe('склонение', () => {
  it('одна форма для единицы', () => {
    expect(pluralOf(1, MINUTES)).toBe('минуту');
    expect(pluralOf(21, MINUTES)).toBe('минуту');
  });

  it('вторая форма для двух, трёх и четырёх', () => {
    expect(pluralOf(2, MINUTES)).toBe('минуты');
    expect(pluralOf(44, MINUTES)).toBe('минуты');
  });

  it('третья форма для остальных', () => {
    expect(pluralOf(5, MINUTES)).toBe('минут');
    expect(pluralOf(0, MINUTES)).toBe('минут');
  });

  it('второй десяток — всегда третья форма', () => {
    // «одиннадцать минут», а не «одиннадцать минуту». И сто двенадцать
    // тоже минут: смотреть надо на две последние цифры, не на одну.
    expect(pluralOf(11, MINUTES)).toBe('минут');
    expect(pluralOf(112, MINUTES)).toBe('минут');
    expect(pluralOf(122, MINUTES)).toBe('минуты');
  });
});
