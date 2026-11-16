import { describe, expect, it } from 'vitest';

import { isSectionActive } from './utils';

const BASE = '/projects/p1';

describe('isSectionActive', () => {
  it('раздел текущий на своём адресе', () => {
    expect(isSectionActive(`${BASE}/roadmap`, `${BASE}/roadmap`, '/roadmap')).toBe(true);
  });

  it('раздел остаётся текущим на вложенном адресе', () => {
    // Страница отчёта по релизу лежит внутри роадмапа, и точное равенство
    // снимало с «Роадмапа» пометку текущего: человек терял место в системе
    // ровно там, куда пришёл по ссылке.
    expect(
      isSectionActive(`${BASE}/roadmap/versions/v1`, `${BASE}/roadmap`, '/roadmap'),
    ).toBe(true);
  });

  it('чужой раздел текущим не становится', () => {
    expect(isSectionActive(`${BASE}/roadmap/versions/v1`, `${BASE}/docs`, '/docs')).toBe(false);
  });

  it('совпадение по префиксу идёт по границе сегмента', () => {
    // Иначе «/roadmapped» считался бы вложенным адресом роадмапа.
    expect(isSectionActive(`${BASE}/roadmapped`, `${BASE}/roadmap`, '/roadmap')).toBe(false);
  });

  it('«Инфо» совпадает только точно', () => {
    // Её адрес — адрес самого проекта, и по префиксу она совпала бы
    // с каждым вложенным разделом сразу.
    expect(isSectionActive(BASE, BASE, '')).toBe(true);
    expect(isSectionActive(`${BASE}/roadmap`, BASE, '')).toBe(false);
    expect(isSectionActive(`${BASE}/roadmap/versions/v1`, BASE, '')).toBe(false);
  });
});
