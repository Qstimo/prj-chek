import { describe, expect, it } from 'vitest';

import { variableCreateSchema, variableUpdateSchema } from './variable';

describe('схема переменной', () => {
  it('принимает ключ в стиле переменных окружения', () => {
    const parsed = variableCreateSchema.parse({ key: 'DATABASE_URL', value: 'postgres://…' });

    expect(parsed.key).toBe('DATABASE_URL');
  });

  it('отвергает ключ в нижнем регистре и с дефисом', () => {
    expect(() => variableCreateSchema.parse({ key: 'database_url', value: 'x' })).toThrow();
    expect(() => variableCreateSchema.parse({ key: 'DATABASE-URL', value: 'x' })).toThrow();
    expect(() => variableCreateSchema.parse({ key: '1KEY', value: 'x' })).toThrow();
  });

  it('требует значение при создании', () => {
    expect(() => variableCreateSchema.parse({ key: 'KEY' })).toThrow();
  });

  it('допускает пустое значение строки', () => {
    // Пустая строка — законное значение переменной окружения.
    expect(variableCreateSchema.parse({ key: 'KEY', value: '' }).value).toBe('');
  });

  it('правка допускает частичные данные', () => {
    expect(variableUpdateSchema.parse({ description: 'Строка подключения' }).description).toBe(
      'Строка подключения',
    );
  });
});
