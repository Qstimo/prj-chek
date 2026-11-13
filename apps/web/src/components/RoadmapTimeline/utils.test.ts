import { RoadmapVersionState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { FILL_MAX, FILL_MIN, LIST_WINDOW, STRIP_MAX_VERSIONS } from './constants';
import { dateLabelOf, fillOf, formOf, noteOf, percentOf, windowOf } from './utils';

const base = {
  id: '1',
  label: 'v1.0',
  plannedDate: null,
  releasedDate: null,
  progress: { done: 0, total: 0 },
};

/** Версия с заданной заполненностью чекпоинтов. */
function withProgress(done: number, total: number, state = RoadmapVersionState.InProgress) {
  return { ...base, state, progress: { done, total } };
}

describe('dateLabelOf', () => {
  it('выпущенная с датой — сама дата', () => {
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Released, releasedDate: '2026-06-15' }),
    ).toBe('15.06.2026');
  });

  it('выпущенная без даты — пусто, даже при плановой', () => {
    // После миграции у старых релизов даты нет; плановая с «ожидается» была бы ложью.
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Released, plannedDate: '2026-06-01' }),
    ).toBe('');
  });

  it('не выпущенная с плановой — «ожидается»', () => {
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Planned, plannedDate: '2026-12-01' }),
    ).toBe('ожидается 01.12.2026');
  });

  it('без дат — пусто', () => {
    expect(dateLabelOf({ ...base, state: RoadmapVersionState.InProgress })).toBe('');
  });
});

describe('fillOf', () => {
  it('выпущенная — полная, сколько бы чекпоинтов ни осталось', () => {
    expect(fillOf(withProgress(1, 3, RoadmapVersionState.Released))).toBe(1);
  });

  it('без чекпоинтов — пусто', () => {
    expect(fillOf(withProgress(0, 0))).toBe(0);
  });

  it('все чекпоинты закрыты — полная, даже если версия не выпущена', () => {
    expect(fillOf(withProgress(47, 47))).toBe(1);
  });

  // Края — главная беда больших наборов: при 347 чекпоинтах честная доля
  // рисует первый закрытый сектором тоньше пикселя, а последний
  // незакрытый — неотличимо от полного круга.
  it('первый закрытый чекпоинт виден и при трёх сотнях', () => {
    expect(fillOf(withProgress(1, 347))).toBeGreaterThanOrEqual(FILL_MIN);
  });

  it('незакрытый остаток виден и при трёх сотнях', () => {
    expect(fillOf(withProgress(346, 347))).toBeLessThanOrEqual(FILL_MAX);
  });

  it('ноль из многих не выдаёт себя за начатую работу', () => {
    expect(fillOf(withProgress(0, 347))).toBe(0);
  });
});

describe('percentOf', () => {
  it('округляет долю до процентов', () => {
    expect(percentOf(withProgress(1, 2))).toBe(50);
  });

  it('выпущенная — сто', () => {
    expect(percentOf(withProgress(1, 3, RoadmapVersionState.Released))).toBe(100);
  });
});

describe('noteOf', () => {
  it('считает закрытые из общего', () => {
    expect(noteOf(withProgress(3, 47))).toBe('3 из 47');
  });

  it('ноль из многих отличается от «чекпоинтов нет»', () => {
    expect(noteOf(withProgress(0, 347))).toBe('0 из 347');
    expect(noteOf(withProgress(0, 0))).toBe('чекпоинтов нет');
  });

  it('у выпущенной счёта нет: под ней дата релиза', () => {
    expect(noteOf(withProgress(1, 3, RoadmapVersionState.Released))).toBe('');
  });
});

describe('formOf', () => {
  it('до порога — лента', () => {
    expect(formOf(STRIP_MAX_VERSIONS)).toBe('strip');
  });

  it('за порогом — список', () => {
    expect(formOf(STRIP_MAX_VERSIONS + 1)).toBe('list');
  });

  it('пустой набор — лента: показывать нечего, и список ни к чему', () => {
    expect(formOf(0)).toBe('strip');
  });
});

describe('windowOf', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => String(index));

  it('набор по размеру окна показывается целиком', () => {
    const result = windowOf(ids(LIST_WINDOW), null, false);

    expect(result.items).toHaveLength(LIST_WINDOW);
    expect(result.hidden).toBe(0);
  });

  it('длинный набор режется с конца: свежие версии важнее давних', () => {
    const result = windowOf(ids(103), null, false);

    expect(result.items).toHaveLength(LIST_WINDOW);
    expect(result.hidden).toBe(103 - LIST_WINDOW);
    expect(result.items[result.items.length - 1]).toBe('102');
  });

  it('окно съезжает к текущей версии, не разрастаясь', () => {
    // «Вы здесь» обязано попасть в видимое, иначе полоса перестаёт
    // отвечать на главный вопрос. Но окно при этом остаётся окном: растяни
    // его от текущей до конца — при текущей версии в середине сотни
    // показалось бы полсотни строк.
    const result = windowOf(ids(103), 2, false);

    expect(result.items).toHaveLength(LIST_WINDOW);
    expect(result.items[0]).toBe('2');
    expect(result.hidden).toBe(103 - LIST_WINDOW);
  });

  it('раскрытое окно показывает всё', () => {
    const result = windowOf(ids(103), null, true);

    expect(result.items).toHaveLength(103);
    expect(result.hidden).toBe(0);
  });
});
