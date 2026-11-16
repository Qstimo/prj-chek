import { describe, expect, it } from 'vitest';

import { downtimeTextOf, fallCountTextOf, uptimeTextOf } from './utils';

describe('счёт падений', () => {
  it('называет окно рядом с числом', () => {
    expect(fallCountTextOf(3, 30)).toBe('падал 3 раза за 30 дней');
  });

  it('склоняет и падения, и дни окна', () => {
    expect(fallCountTextOf(1, 1)).toBe('падал 1 раз за 1 день');
    expect(fallCountTextOf(11, 22)).toBe('падал 11 раз за 22 дня');
  });
});

describe('время простоя', () => {
  it('нулевой простой назван прямо, а не пустой строкой', () => {
    expect(downtimeTextOf(0)).toBe('не падал ни разу');
  });

  it('секунды — это меньше минуты', () => {
    expect(downtimeTextOf(42)).toBe('меньше минуты');
  });

  it('минуты и часы показываются вместе', () => {
    expect(downtimeTextOf(2 * 3600 + 15 * 60)).toBe('2 ч 15 мин');
  });

  it('сутки отбрасывают минуты: точность здесь не нужна', () => {
    expect(downtimeTextOf(26 * 3600 + 15 * 60)).toBe('1 д 2 ч');
  });

  it('ровный час не дописывает ноль минут', () => {
    expect(downtimeTextOf(3600)).toBe('1 ч');
  });
});

describe('доля времени', () => {
  it('полный аптайм — без дробей', () => {
    expect(uptimeTextOf(1)).toBe('100%');
  });

  it('доля округляется до двух знаков', () => {
    expect(uptimeTextOf(0.998723)).toBe('99,87%');
  });

  it('округление вниз: 99,999% не превращается в 100%', () => {
    // «100%» у адреса, который падал, — ложное успокоение.
    expect(uptimeTextOf(0.99999)).toBe('99,99%');
  });
});
