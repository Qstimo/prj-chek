import { describe, expect, it } from 'vitest';

import { EnvironmentKind } from '../enums';
import { environmentCreateSchema, environmentUpdateSchema } from './environment';

describe('схема создания окружения', () => {
  it('принимает минимальное окружение', () => {
    const parsed = environmentCreateSchema.parse({
      name: 'Прод',
      kind: EnvironmentKind.Production,
    });

    expect(parsed.name).toBe('Прод');
  });

  it('требует имя и вид', () => {
    expect(() => environmentCreateSchema.parse({ name: 'Прод' })).toThrow();
    expect(() => environmentCreateSchema.parse({ kind: EnvironmentKind.Production })).toThrow();
  });

  it('отвергает пустое имя', () => {
    expect(() =>
      environmentCreateSchema.parse({ name: '   ', kind: EnvironmentKind.Production }),
    ).toThrow();
  });
});

describe('домены окружения', () => {
  it('приводит домен к нижнему регистру', () => {
    const parsed = environmentUpdateSchema.parse({ domains: ['Example.COM'] });

    expect(parsed.domains).toEqual(['example.com']);
  });

  it('обрезает пробелы вокруг домена', () => {
    const parsed = environmentUpdateSchema.parse({ domains: ['  example.com  '] });

    expect(parsed.domains).toEqual(['example.com']);
  });

  it('отвергает строку, не похожую на домен', () => {
    // Иначе в реестр попадёт «мой сервер» вместо адреса, и проверки
    // сроков на этапе 6 будут падать на бессмысленных данных.
    expect(() => environmentUpdateSchema.parse({ domains: ['не домен'] })).toThrow();
  });

  it('отвергает повторяющиеся домены', () => {
    expect(() =>
      environmentUpdateSchema.parse({ domains: ['example.com', 'EXAMPLE.com'] }),
    ).toThrow();
  });
});

describe('серверные параметры', () => {
  it('принимает адрес IPv4 и IPv6', () => {
    expect(environmentUpdateSchema.parse({ ip: '203.0.113.10' }).ip).toBe('203.0.113.10');
    expect(environmentUpdateSchema.parse({ ip: '2001:db8::1' }).ip).toBe('2001:db8::1');
  });

  it('отвергает произвольную строку вместо адреса', () => {
    expect(() => environmentUpdateSchema.parse({ ip: 'сервер в углу' })).toThrow();
  });

  it('принимает пустые значения как отсутствие', () => {
    // Реестр заполняется постепенно: «провайдер неизвестен» — рабочее состояние.
    const parsed = environmentUpdateSchema.parse({ ip: null, provider: null, notes: null });

    expect(parsed.ip).toBeNull();
  });

  it('требует адрес health-check в виде ссылки', () => {
    expect(() => environmentUpdateSchema.parse({ healthCheckUrl: 'localhost' })).toThrow();
    expect(
      environmentUpdateSchema.parse({ healthCheckUrl: 'https://example.com/health' })
        .healthCheckUrl,
    ).toBe('https://example.com/health');
  });
});
