import { EnvironmentKind, StatusIndicator } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { buildDomainMap, type DomainMapInput, type DomainMapSubdomain } from './domain-map';

const NOW = new Date('2026-09-10T12:00:00Z');

const ROOT_A = '11111111-1111-1111-1111-111111111111';
const ROOT_B = '22222222-2222-2222-2222-222222222222';
const PROJECT = '33333333-3333-3333-3333-333333333333';

function root(id: string, name: string, paidUntil: string | null = null): DomainMapInput['domains'][number] {
  return { id, name, owner: null, paidUntil };
}

function subdomain(domainId: string, id: string, name: string): DomainMapSubdomain {
  return {
    domainId,
    id,
    name,
    environmentId: 'e1',
    environmentName: 'Прод',
    environmentKind: EnvironmentKind.Production,
    projectId: PROJECT,
    projectName: 'Витрина',
  };
}

describe('сборка карты доменов', () => {
  it('пустой реестр даёт пустую карту', () => {
    expect(buildDomainMap({ domains: [], subdomains: [] }, NOW)).toEqual({
      domains: [],
      projects: [],
      edges: [],
    });
  });

  it('корень без поддоменов — узел без рёбер', () => {
    const map = buildDomainMap({ domains: [root(ROOT_A, 'example.com')], subdomains: [] }, NOW);

    expect(map.domains[0]?.indicator).toBe(StatusIndicator.Unknown);
    expect(map.edges).toEqual([]);
    expect(map.projects).toEqual([]);
  });

  it('складывает поддомены одного проекта в одно ребро', () => {
    const map = buildDomainMap(
      {
        domains: [root(ROOT_A, 'example.com')],
        subdomains: [
          subdomain(ROOT_A, 's1', 'example.com'),
          subdomain(ROOT_A, 's2', 'stage.example.com'),
        ],
      },
      NOW,
    );

    expect(map.edges).toHaveLength(1);
    expect(map.edges[0]?.subdomains.map((item) => item.name)).toEqual([
      'example.com',
      'stage.example.com',
    ]);
    expect(map.projects).toHaveLength(1);
  });

  it('проект на двух корнях даёт два ребра и один узел проекта', () => {
    const map = buildDomainMap(
      {
        domains: [root(ROOT_A, 'example.com'), root(ROOT_B, 'example.org')],
        subdomains: [
          subdomain(ROOT_A, 's1', 'stage.example.com'),
          subdomain(ROOT_B, 's2', 'stage.example.org'),
        ],
      },
      NOW,
    );

    expect(map.edges).toHaveLength(2);
    expect(map.projects).toHaveLength(1);
  });

  it('близкий срок продления гасит и корень, и проекты на нём', () => {
    const map = buildDomainMap(
      {
        domains: [root(ROOT_A, 'example.com', '2026-09-20')],
        subdomains: [subdomain(ROOT_A, 's1', 'stage.example.com')],
      },
      NOW,
    );

    expect(map.domains[0]?.indicator).toBe(StatusIndicator.Warning);
    expect(map.projects[0]?.indicator).toBe(StatusIndicator.Warning);
  });

  it('проект на корнях без срока — неизвестно, а не в порядке', () => {
    // Сразу после переноса срок у корней пуст: зелёный проект здесь
    // означал бы «оплата проверена», чего никто не проверял.
    const map = buildDomainMap(
      {
        domains: [root(ROOT_A, 'example.com')],
        subdomains: [subdomain(ROOT_A, 's1', 'stage.example.com')],
      },
      NOW,
    );

    expect(map.domains[0]?.indicator).toBe(StatusIndicator.Unknown);
    expect(map.projects[0]?.indicator).toBe(StatusIndicator.Unknown);
  });

  it('известный срок хотя бы на одном корне снимает неизвестность', () => {
    const map = buildDomainMap(
      {
        domains: [root(ROOT_A, 'example.com'), root(ROOT_B, 'example.org', '2027-09-20')],
        subdomains: [
          subdomain(ROOT_A, 's1', 'stage.example.com'),
          subdomain(ROOT_B, 's2', 'stage.example.org'),
        ],
      },
      NOW,
    );

    expect(map.projects[0]?.indicator).toBe(StatusIndicator.Ok);
  });

  it('далёкий срок оставляет всё в порядке', () => {
    const map = buildDomainMap(
      {
        domains: [root(ROOT_A, 'example.com', '2027-09-20')],
        subdomains: [subdomain(ROOT_A, 's1', 'stage.example.com')],
      },
      NOW,
    );

    expect(map.domains[0]?.indicator).toBe(StatusIndicator.Ok);
    expect(map.projects[0]?.indicator).toBe(StatusIndicator.Ok);
  });
});
