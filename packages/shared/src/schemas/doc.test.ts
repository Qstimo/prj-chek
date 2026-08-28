import { describe, expect, it } from 'vitest';

import { docPageCreateSchema, docPageUpdateSchema } from './doc';

describe('схема страницы документации', () => {
  it('принимает заголовок и содержимое', () => {
    const parsed = docPageCreateSchema.parse({
      title: 'Развёртывание',
      content: '# Как развернуть\n\nШаги ниже.',
    });

    expect(parsed.title).toBe('Развёртывание');
  });

  it('требует заголовок и содержимое', () => {
    expect(() => docPageCreateSchema.parse({ content: 'Текст' })).toThrow();
    expect(() => docPageCreateSchema.parse({ title: 'Заголовок' })).toThrow();
    expect(() => docPageCreateSchema.parse({ title: '  ', content: 'Текст' })).toThrow();
  });

  it('правка частична', () => {
    expect(docPageUpdateSchema.parse({ title: 'Новый' }).title).toBe('Новый');
    expect(docPageUpdateSchema.parse({})).toEqual({});
  });
});
