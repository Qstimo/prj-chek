import { RoadmapVersionState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COLUMNS,
  DEFAULT_LAST,
  FILL_MAX,
  FILL_MIN,
  LIST_WINDOW,
  STRIP_MAX_VERSIONS,
} from './constants';
import {
  columnsFor,
  columnsTemplate,
  dateLabelOf,
  fillOf,
  formOf,
  noteOf,
  percentOf,
  rowsTemplate,
  serpentinePlan,
  windowOf,
  windowSizeOf,
} from './utils';

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
  it('серпантин выбран по умолчанию и для короткого роадмапа', () => {
    expect(formOf(STRIP_MAX_VERSIONS)).toBe('serpentine');
  });

  it('за порогом — серпантин: лента в одну строку уже не умещается', () => {
    // Список остаётся, но выбирает его человек переключателем, а не
    // количество: карта отвечает на вопрос «где мы» лучше перечня строк.
    expect(formOf(STRIP_MAX_VERSIONS + 1)).toBe('serpentine');
  });

  it('пустой набор сохраняет основную укладку', () => {
    expect(formOf(0)).toBe('serpentine');
  });
});

describe('windowSizeOf', () => {
  it('без указания — умолчание укладки', () => {
    expect(windowSizeOf('list', undefined)).toBe(LIST_WINDOW);
    expect(windowSizeOf('serpentine', undefined)).toBe(DEFAULT_LAST);
    expect(windowSizeOf('strip', undefined)).toBe(STRIP_MAX_VERSIONS);
  });

  it('число — столько последних', () => {
    expect(windowSizeOf('serpentine', 25)).toBe(25);
  });

  it('null — все: предела нет', () => {
    expect(windowSizeOf('serpentine', null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('windowOf', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => String(index));

  it('набор по размеру окна показывается целиком', () => {
    const result = windowOf(ids(LIST_WINDOW), null, false);

    expect(result.items).toHaveLength(LIST_WINDOW);
    expect(result.hidden).toBe(0);
    expect(result.start).toBe(0);
  });

  it('длинный набор режется с конца: свежие версии важнее давних', () => {
    const result = windowOf(ids(103), null, false);

    expect(result.items).toHaveLength(LIST_WINDOW);
    expect(result.hidden).toBe(103 - LIST_WINDOW);
    expect(result.items[result.items.length - 1]).toBe('102');
    expect(result.start).toBe(103 - LIST_WINDOW);
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

  it('съехавшее окно называет своё начало, а не только размер', () => {
    // Без начала вызывающий считает позицию как «отрезано с конца», и у
    // съехавшего окна номера расходятся с набором: метка текущей версии
    // не достаётся никому.
    expect(windowOf(ids(103), 2, false).start).toBe(2);
    expect(windowOf(ids(103), 0, false).start).toBe(0);
  });

  it('раскрытое окно показывает всё', () => {
    const result = windowOf(ids(103), null, true);

    expect(result.items).toHaveLength(103);
    expect(result.hidden).toBe(0);
    expect(result.start).toBe(0);
  });

  it('размер окна задаётся снаружи', () => {
    const result = windowOf(ids(103), null, false, 5);

    expect(result.items).toHaveLength(5);
    expect(result.start).toBe(98);
    expect(result.hidden).toBe(98);
  });

  it('предела нет — показывается всё', () => {
    expect(windowOf(ids(103), null, false, Number.POSITIVE_INFINITY).items).toHaveLength(103);
  });
});

describe('columnsFor', () => {
  it('неизмеренная ширина — умолчание: ждать измерения укладка не вправе', () => {
    expect(columnsFor(0)).toBe(DEFAULT_COLUMNS);
  });

  it('внутренний экран — девять столбцов', () => {
    // 976 px под содержимое минус два столбца поворота: (976 − 48) / 96.
    expect(columnsFor(976)).toBe(9);
  });

  it('публичная страница уже внутреннего экрана, и строка там короче', () => {
    // Ровно дефект 23: при зашитом пороге на десять версий лента на
    // 720 px молча уезжала в прокрутку.
    expect(columnsFor(720)).toBe(7);
  });

  it('совсем узкое место — хотя бы один столбец', () => {
    expect(columnsFor(60)).toBe(1);
  });
});

describe('serpentinePlan', () => {
  it('строки чередуют направление', () => {
    const plan = serpentinePlan(7, 3);

    expect(plan.cells.slice(0, 3).map((cell) => cell.gridColumn)).toEqual([2, 3, 4]);
    expect(plan.cells.slice(3, 6).map((cell) => cell.gridColumn)).toEqual([4, 3, 2]);
    expect(plan.cells[6]!.gridColumn).toBe(2);
  });

  it('направление помечено: по нему версия решает, с какой стороны ось', () => {
    const plan = serpentinePlan(4, 2);

    expect(plan.cells.map((cell) => cell.isReversed)).toEqual([false, false, true, true]);
  });

  it('между строками версий лежит строка поворота', () => {
    const plan = serpentinePlan(7, 3);

    expect(plan.cells[0]!.gridRow).toBe(1);
    expect(plan.cells[3]!.gridRow).toBe(3);
    expect(plan.cells[6]!.gridRow).toBe(5);
    expect(plan.rows).toBe(3);
  });

  it('перемычка стоит с той стороны, где строка кончилась', () => {
    expect(serpentinePlan(7, 3).knees).toEqual([
      { side: 'right', gridColumn: 5, gridRow: 1 },
      { side: 'left', gridColumn: 1, gridRow: 3 },
    ]);
  });

  it('одна строка — перемычек нет', () => {
    expect(serpentinePlan(3, 10).knees).toEqual([]);
    expect(serpentinePlan(3, 10).rows).toBe(1);
  });

  it('нулевая ширина строки не вешает раскладку', () => {
    expect(serpentinePlan(2, 0).columns).toBe(1);
  });
});

describe('шаблоны сетки серпантина', () => {
  it('столбцы: крайние под колено, остальные шагом оси', () => {
    expect(columnsTemplate(3)).toBe('24px repeat(3, 96px) 24px');
  });

  it('строки: версия, поворот, версия', () => {
    expect(rowsTemplate(2)).toBe('120px 24px 120px');
    expect(rowsTemplate(1)).toBe('120px');
  });
});
