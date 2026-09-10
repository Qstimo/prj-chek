import { describe, expect, it } from 'vitest';

import { EnvironmentKind, StatusIndicator } from '../enums';
import {
  DOMAIN_RENEWAL_WARN_DAYS,
  domainCreateSchema,
  domainDetailSchema,
  domainMapSchema,
  domainRowSchema,
  domainUpdateSchema,
  rootDomainOf,
} from './domain';

const DOMAIN_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const ENVIRONMENT_ID = '33333333-3333-3333-3333-333333333333';
const SUBDOMAIN_ID = '44444444-4444-4444-4444-444444444444';

describe('порог предупреждения о продлении', () => {
  it('равен месяцу', () => {
    // Просроченный домен могут перехватить — две недели здесь мало.
    expect(DOMAIN_RENEWAL_WARN_DAYS).toBe(30);
  });
});

describe('корневой домен', () => {
  it('домен второго уровня — сам себе корень', () => {
    expect(rootDomainOf('example.com')).toBe('example.com');
  });

  it('поддомен сводится к двум последним меткам', () => {
    expect(rootDomainOf('stage.example.com')).toBe('example.com');
    expect(rootDomainOf('a.b.example.com')).toBe('example.com');
  });

  it('двухуровневый суффикс не считается корнем', () => {
    // Платят за shop.co.uk, а не за co.uk: у зоны регистрируемое имя третьего уровня.
    expect(rootDomainOf('shop.co.uk')).toBe('shop.co.uk');
    expect(rootDomainOf('stage.shop.co.uk')).toBe('shop.co.uk');
    expect(rootDomainOf('api.stage.shop.com.ua')).toBe('shop.com.ua');
  });

  it('имя без точки остаётся собой', () => {
    expect(rootDomainOf('localhost')).toBe('localhost');
  });

  it('приводит регистр и обрезает края', () => {
    expect(rootDomainOf('  Stage.Example.COM ')).toBe('example.com');
  });
});

describe('схема создания домена', () => {
  it('нормализует имя', () => {
    expect(domainCreateSchema.parse({ name: '  Example.COM ' }).name).toBe('example.com');
  });

  it('отвергает строку, не похожую на домен', () => {
    expect(() => domainCreateSchema.parse({ name: 'мой домен' })).toThrow();
  });

  it('принимает владельца, регистратора и срок', () => {
    const parsed = domainCreateSchema.parse({
      name: 'example.com',
      owner: 'ООО Ромашка',
      registrar: 'REG.RU',
      paidUntil: '2027-01-12',
    });

    expect(parsed).toMatchObject({ owner: 'ООО Ромашка', registrar: 'REG.RU' });
  });

  it('отвергает срок с часом', () => {
    expect(() =>
      domainCreateSchema.parse({ name: 'example.com', paidUntil: '2027-01-12T00:00:00Z' }),
    ).toThrow();
  });
});

describe('схема правки домена', () => {
  it('принимает пустой объект', () => {
    expect(domainUpdateSchema.parse({})).toEqual({});
  });

  it('не принимает имя', () => {
    // Переименование корня осиротило бы его поддомены.
    expect(domainUpdateSchema.parse({ name: 'other.com', owner: 'ООО Ромашка' })).toEqual({
      owner: 'ООО Ромашка',
    });
  });
});

describe('схема строки реестра доменов', () => {
  it('собирается с агрегатами', () => {
    const parsed = domainRowSchema.parse({
      id: DOMAIN_ID,
      name: 'example.com',
      owner: 'ООО Ромашка',
      registrar: 'REG.RU',
      paidUntil: '2027-01-12',
      notes: null,
      indicator: StatusIndicator.Ok,
      warnings: [],
      subdomainCount: 3,
      projectCount: 2,
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
    });

    expect(parsed.subdomainCount).toBe(3);
  });
});

describe('схема деталей домена', () => {
  it('перечисляет поддомены с окружениями и проектами', () => {
    const parsed = domainDetailSchema.parse({
      id: DOMAIN_ID,
      name: 'example.com',
      owner: null,
      registrar: null,
      paidUntil: null,
      notes: null,
      indicator: StatusIndicator.Unknown,
      warnings: [],
      subdomainCount: 1,
      projectCount: 1,
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
      subdomains: [
        {
          id: SUBDOMAIN_ID,
          name: 'stage.example.com',
          environmentId: ENVIRONMENT_ID,
          environmentName: 'Стейдж',
          environmentKind: EnvironmentKind.Staging,
          projectId: PROJECT_ID,
          projectName: 'Витрина',
        },
      ],
    });

    expect(parsed.subdomains[0]?.name).toBe('stage.example.com');
  });
});

describe('схема карты доменов', () => {
  it('собирается на образце с одним ребром', () => {
    const parsed = domainMapSchema.parse({
      domains: [
        {
          id: DOMAIN_ID,
          name: 'example.com',
          owner: null,
          indicator: StatusIndicator.Ok,
          paidUntil: null,
          warnings: [],
        },
      ],
      projects: [{ id: PROJECT_ID, name: 'Витрина', indicator: StatusIndicator.Ok }],
      edges: [
        {
          domainId: DOMAIN_ID,
          projectId: PROJECT_ID,
          subdomains: [{ id: SUBDOMAIN_ID, name: 'stage.example.com' }],
        },
      ],
    });

    expect(parsed.edges[0]?.subdomains).toHaveLength(1);
  });
});
