import { describe, expect, it } from 'vitest';

import { generateSlug } from './slug';

describe('generateSlug', () => {
  it('транслитерирует кириллицу', () => {
    expect(generateSlug('Мой Проект')).toBe('moj-proekt');
  });

  it('заменяет пробелы дефисами', () => {
    expect(generateSlug('система учёта')).toBe('sistema-ucheta');
  });

  it('убирает знаки препинания', () => {
    expect(generateSlug('Проект №1: главный!')).toBe('proekt-1-glavnyj');
  });

  it('схлопывает повторяющиеся дефисы', () => {
    expect(generateSlug('а  —  б')).toBe('a-b');
  });

  it('обрезает дефисы по краям', () => {
    expect(generateSlug('  проект  ')).toBe('proekt');
  });

  it('сохраняет латиницу и цифры', () => {
    expect(generateSlug('CAIRN v2')).toBe('cairn-v2');
  });

  it('даёт запасное значение для строки без пригодных символов', () => {
    // Пустой слаг сделал бы ссылку на проект неработающей.
    expect(generateSlug('!!!')).toBe('proekt');
  });
});
