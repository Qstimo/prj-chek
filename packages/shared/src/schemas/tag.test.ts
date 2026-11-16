import { describe, expect, it } from 'vitest';

import { tagSetSchema, tagSlug } from './tag';

describe('tagSlug', () => {
  it('приводит регистр и пробелы к одной форме', () => {
    // Иначе «Web», «web» и «  Web  » стали бы тремя разными тегами,
    // и фильтр по каждому показывал бы часть проектов.
    expect(tagSlug('Web')).toBe('web');
    expect(tagSlug('  WEB  ')).toBe('web');
    expect(tagSlug('Мобильное  приложение')).toBe('мобильное приложение');
  });

  it('различает теги, отличающиеся не только регистром', () => {
    expect(tagSlug('Web')).not.toBe(tagSlug('Product'));
  });
});

describe('tagSetSchema', () => {
  it('обрезает названия и отвергает лишние поля', () => {
    expect(tagSetSchema.parse({ labels: [' Web ', 'Product'] })).toEqual({
      labels: ['Web', 'Product'],
    });

    expect(() => tagSetSchema.parse({ labels: ['Web'], extra: 1 })).toThrow();
  });

  it('принимает пустой набор: это снятие всех тегов', () => {
    expect(tagSetSchema.parse({ labels: [] }).labels).toEqual([]);
  });

  it('отвергает повтор, различимый только регистром', () => {
    // Набор правится целиком, и «Web» с «web» легли бы в одну строку
    // связи — вторая вставка упёрлась бы в ключ уже внутри транзакции.
    expect(() => tagSetSchema.parse({ labels: ['Web', 'web'] })).toThrow();
  });

  it('отвергает пустое название', () => {
    expect(() => tagSetSchema.parse({ labels: [' '] })).toThrow();
  });
});
