import { describe, expect, it } from 'vitest';

import { nextVersionLabel } from './next-version-label';

/** Версии проекта в порядке `position`: так их читает полоса роадмапа. */
function versions(...labels: string[]): { label: string; position: number }[] {
  return labels.map((label, index) => ({ label, position: index + 1 }));
}

describe('следующее обозначение версии', () => {
  it.each([
    [['v1.2'], 'v1.3'],
    [['1.0.9'], '1.0.10'],
    [['2026.11'], '2026.12'],
    [['v1.08'], 'v1.09'],
    [['v2 beta'], 'v3 beta'],
    [['release7'], 'release8'],
    [['v1.9'], 'v1.10'],
  ])('%s → %s', (labels, expected) => {
    // Увеличивается последняя группа цифр где угодно в строке: схему
    // версионирования проекта система не знает, и единственная
    // безопасная догадка — младшая группа. Поэтому v1.9 → v1.10, а не
    // v2.0.
    expect(nextVersionLabel(versions(...labels))).toBe(expected);
  });

  it('без версий подставлять нечего', () => {
    expect(nextVersionLabel([])).toBeNull();
  });

  it('обозначение без цифр подсказки не даёт', () => {
    // Угадывать «следующее» у MVP или «Осень» нечем, и выдумывать
    // v1.0 поверх чужой схемы нельзя.
    expect(nextVersionLabel(versions('MVP'))).toBeNull();
  });

  it('берёт последнюю версию по position, а не по строке', () => {
    // Тот же порядок, в котором версии читает полоса роадмапа: второй
    // порядок разошёлся бы с первым.
    expect(nextVersionLabel([
      { label: 'v3', position: 2 },
      { label: 'v9', position: 1 },
    ])).toBe('v4');
  });

  it('занятое обозначение перешагивается', () => {
    expect(nextVersionLabel(versions('v1.3', 'v1.2'))).toBe('v1.4');
  });

  it('десять занятых подряд — подсказки нет', () => {
    // Десять попыток, а не тысяча: это подсказка в заполненном поле.
    // Если занято десять следующих, человек посмотрит на роадмап сам.
    const labels = Array.from({ length: 12 }, (_, index) => `v1.${index + 1}`);

    expect(nextVersionLabel(versions(...labels, 'v1.0'))).toBeNull();
  });

  it('ширина с ведущими нулями сохраняется, пока помещается', () => {
    expect(nextVersionLabel(versions('v1.099'))).toBe('v1.100');
  });
});
