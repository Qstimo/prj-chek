import { describe, expect, it } from 'vitest';

import { parseEnv, serializeEnv } from './env-format';

describe('parseEnv', () => {
  it('разбирает пары KEY=VALUE', () => {
    expect(parseEnv('DATABASE_URL=postgres://db\nPORT=3000')).toEqual([
      { key: 'DATABASE_URL', value: 'postgres://db' },
      { key: 'PORT', value: '3000' },
    ]);
  });

  it('пропускает комментарии и пустые строки', () => {
    expect(parseEnv('# заголовок\n\nKEY=value\n')).toEqual([{ key: 'KEY', value: 'value' }]);
  });

  it('снимает одинарные и двойные кавычки', () => {
    expect(parseEnv('A="со пробелом"\nB=\'одинарные\'')).toEqual([
      { key: 'A', value: 'со пробелом' },
      { key: 'B', value: 'одинарные' },
    ]);
  });

  it('раскрывает экранированный перевод строки в двойных кавычках', () => {
    expect(parseEnv('KEY="строка\\nвторая"')).toEqual([{ key: 'KEY', value: 'строка\nвторая' }]);
  });

  it('обрезает пробелы вокруг незакавыченного значения', () => {
    expect(parseEnv('KEY=  значение  ')).toEqual([{ key: 'KEY', value: 'значение' }]);
  });

  it('сообщает о строке, не похожей на пару', () => {
    expect(() => parseEnv('KEY=ok\nмусор без знака равно')).toThrow(/строка 2/i);
  });

  it('сообщает о недопустимом ключе', () => {
    expect(() => parseEnv('key-с-дефисом=x')).toThrow(/ключ/i);
  });

  it('последнее вхождение ключа побеждает', () => {
    expect(parseEnv('KEY=первое\nKEY=второе')).toEqual([{ key: 'KEY', value: 'второе' }]);
  });
});

describe('serializeEnv', () => {
  it('собирает простые пары без кавычек', () => {
    expect(serializeEnv([{ key: 'PORT', value: '3000' }])).toBe('PORT=3000\n');
  });

  it('оборачивает в кавычки значения с пробелами, решёткой и кавычками', () => {
    expect(serializeEnv([{ key: 'A', value: 'со пробелом' }])).toBe('A="со пробелом"\n');
    expect(serializeEnv([{ key: 'B', value: 'x#y' }])).toBe('B="x#y"\n');
    expect(serializeEnv([{ key: 'C', value: 'он сказал "да"' }])).toBe(
      'C="он сказал \\"да\\""\n',
    );
  });

  it('экранирует перевод строки', () => {
    expect(serializeEnv([{ key: 'KEY', value: 'a\nb' }])).toBe('KEY="a\\nb"\n');
  });

  it('разбор собранного возвращает исходные пары', () => {
    const pairs = [
      { key: 'SIMPLE', value: 'значение' },
      { key: 'SPACED', value: 'с пробелом и "кавычками"' },
      { key: 'MULTILINE', value: 'первая\nвторая' },
      { key: 'EMPTY', value: '' },
    ];

    expect(parseEnv(serializeEnv(pairs))).toEqual(pairs);
  });
});
