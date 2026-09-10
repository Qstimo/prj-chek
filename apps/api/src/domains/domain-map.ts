import { StatusIndicator, type DomainMap, type EnvironmentKind } from '@cairn/shared';

import { domainRenewalWarningsOf } from '../status/indicator';

/** Корень реестра в объёме, нужном карте. */
export interface DomainMapRoot {
  id: string;
  name: string;
  owner: string | null;
  paidUntil: string | null;
}

/** Поддомен вместе с окружением и проектом, которым он принадлежит. */
export interface DomainMapSubdomain {
  domainId: string;
  id: string;
  name: string;
  environmentId: string;
  environmentName: string;
  environmentKind: EnvironmentKind;
  projectId: string;
  projectName: string;
}

/** Плоские строки, из которых собирается карта доменов. */
export interface DomainMapInput {
  domains: DomainMapRoot[];
  subdomains: DomainMapSubdomain[];
}

/**
 * Собирает карту доменов из плоских строк.
 *
 * Отдельная чистая функция по той же причине, что и у карты серверов:
 * группировка рёбер — самая содержательная часть, и проверять её поднятой
 * базой значило бы платить контейнером за арифметику.
 *
 * Индикатор проекта здесь считается только по срокам его корней: живость
 * окружений — предмет карты серверов, и смешивать две карты незачем.
 */
export function buildDomainMap(input: DomainMapInput, now: Date): DomainMap {
  const byProject = groupBy(input.subdomains, (subdomain) => subdomain.projectId);
  const byEdge = groupBy(
    input.subdomains,
    (subdomain) => `${subdomain.domainId} ${subdomain.projectId}`,
  );

  const warningRoots = new Set(
    input.domains
      .filter((root) => domainRenewalWarningsOf(root.name, root.paidUntil, now).length > 0)
      .map((root) => root.id),
  );

  return {
    domains: input.domains.map((root) => {
      const warnings = domainRenewalWarningsOf(root.name, root.paidUntil, now);

      return {
        id: root.id,
        name: root.name,
        owner: root.owner,
        indicator: indicatorOf(root.paidUntil, warnings.length),
        paidUntil: root.paidUntil,
        warnings,
      };
    }),
    projects: [...byProject.values()].map((subdomains) => {
      const first = subdomains[0]!;
      const isWarning = subdomains.some((subdomain) => warningRoots.has(subdomain.domainId));

      return {
        id: first.projectId,
        name: first.projectName,
        indicator: isWarning ? StatusIndicator.Warning : StatusIndicator.Ok,
      };
    }),
    edges: [...byEdge.values()].map((subdomains) => {
      const first = subdomains[0]!;

      return {
        domainId: first.domainId,
        projectId: first.projectId,
        subdomains: subdomains.map((subdomain) => ({ id: subdomain.id, name: subdomain.name })),
      };
    }),
  };
}

/** Индикатор корня: срок оплаты — единственное, что о нём известно. */
function indicatorOf(paidUntil: string | null, warningCount: number): StatusIndicator {
  if (!paidUntil) {
    return StatusIndicator.Unknown;
  }

  return warningCount > 0 ? StatusIndicator.Warning : StatusIndicator.Ok;
}

/** Группирует строки по ключу, сохраняя порядок появления. */
function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = keyOf(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}
