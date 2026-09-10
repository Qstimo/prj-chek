import { describe, expect, it } from 'vitest';

import { EnvironmentKind } from '../enums';
import {
  environmentCreateSchema,
  environmentDetailSchema,
  environmentUpdateSchema,
} from './environment';

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

describe('привязка окружения к серверу', () => {
  it('принимает идентификатор сервера', () => {
    const parsed = environmentUpdateSchema.parse({
      serverId: '11111111-1111-1111-1111-111111111111',
    });

    expect(parsed.serverId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('принимает null как отвязку от сервера', () => {
    expect(environmentUpdateSchema.parse({ serverId: null }).serverId).toBeNull();
  });

  it('отвергает не-идентификатор', () => {
    expect(() => environmentUpdateSchema.parse({ serverId: 'нет' })).toThrow();
  });

  it('больше не принимает серверные поля машины', () => {
    // Они переехали на сервер: у машины они одни, и хранение их в каждом
    // окружении неизбежно разошлось бы.
    const parsed = environmentUpdateSchema.parse({
      ip: '203.0.113.10',
      provider: 'Hetzner',
      specs: '4 vCPU',
    });

    expect(parsed).toEqual({});
  });
});

describe('адрес окружения', () => {
  it('принимает собственный адрес окружения', () => {
    expect(environmentUpdateSchema.parse({ host: 'stage.example.com' }).host).toBe(
      'stage.example.com',
    );
  });

  it('принимает пустые значения как отсутствие', () => {
    // Реестр заполняется постепенно: «адрес неизвестен» — рабочее состояние.
    const parsed = environmentUpdateSchema.parse({ host: null, notes: null });

    expect(parsed.host).toBeNull();
  });

  it('требует адрес health-check в виде ссылки', () => {
    expect(() => environmentUpdateSchema.parse({ healthCheckUrl: 'localhost' })).toThrow();
    expect(
      environmentUpdateSchema.parse({ healthCheckUrl: 'https://example.com/health' })
        .healthCheckUrl,
    ).toBe('https://example.com/health');
  });
});

describe('схема деталей окружения', () => {
  const BASE = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Прод',
    kind: EnvironmentKind.Production,
    domains: ['example.com'],
    host: null,
    healthCheckUrl: null,
    notes: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
  };

  it('собирается без сервера', () => {
    const parsed = environmentDetailSchema.parse({ ...BASE, server: null });

    expect(parsed.server).toBeNull();
  });

  it('несёт параметры машины вложенным объектом', () => {
    const parsed = environmentDetailSchema.parse({
      ...BASE,
      server: {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'hetzner-fsn-1',
        owner: 'ООО Ромашка',
        host: 'fsn1.example.com',
        ip: '203.0.113.10',
        provider: 'Hetzner',
        specs: '4 vCPU, 8 ГБ',
      },
    });

    expect(parsed.server?.owner).toBe('ООО Ромашка');
    expect(parsed).not.toHaveProperty('ip');
  });
});
