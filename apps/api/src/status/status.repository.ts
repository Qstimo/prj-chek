import {
  AccessLevel,
  HealthState,
  Section,
  type DomainStatus,
  type EnvironmentStatus,
  type ProjectStatus,
  type StatusSummaryRow,
  type StatusWarning,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import {
  domainStatuses,
  environmentDomains,
  domains,
  environments,
  projects,
  servers,
} from '../db/schema';
import { domainRenewalWarningsOf, indicatorOf, serverWarningsOf, warningsOf } from './indicator';
import { environmentStatusesOf } from './status.projection';

/**
 * Результат всех проверок адреса для записи.
 *
 * Три проверки приходят вместе намеренно: пока здоровье писалось отдельно
 * от сроков, записи могли описывать разные хосты.
 */
export interface AddressStatusInput {
  health: HealthState;
  latencyMs: number | null;
  healthError: string | null;
  resolvedIp: string | null;
  resolveError: string | null;
  tlsValidTo: Date | null;
  tlsError: string | null;
  registryExpiresAt: Date | null;
  registryError: string | null;
}

/** Адрес окружения как цель обхода: имя и путь ручки приложения. */
export interface AddressTarget {
  id: string;
  name: string;
  healthCheckPath: string | null;
}

/** Окружение со своими адресами: цель второго прохода прогона. */
export interface DiscoveryTarget {
  environmentId: string;
  environmentName: string;
  serverId: string | null;
  addresses: { name: string; resolvedIp: string | null }[];
}

/**
 * Хранилище результатов автопроверок (ТЗ 6).
 *
 * Записи без субъекта: их делает системный runner, а не пользователь.
 * Чтение агрегатов — с проверкой прав: статус принадлежит уровню
 * «метаданные» секции «Инфраструктура» (ТЗ 4.3).
 */
@Injectable()
export class StatusRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Пишет результат проверок адреса: одна строка на адрес. */
  async upsertAddressStatus(domainId: string, input: AddressStatusInput): Promise<void> {
    await this.db
      .insert(domainStatuses)
      .values({ domainId, ...input, checkedAt: new Date() })
      .onConflictDoUpdate({
        target: domainStatuses.domainId,
        set: { ...input, checkedAt: new Date() },
      });
  }

  /**
   * Цели проверок — адреса окружений.
   *
   * Одна цель вместо двух списков: у окружения нет адреса помимо доменов,
   * и путь проверки идёт вместе с именем, по которому её делать.
   */
  async listTargets(): Promise<{ addresses: AddressTarget[] }> {
    const addresses = await this.db
      .select({
        id: environmentDomains.id,
        name: environmentDomains.name,
        healthCheckPath: environments.healthCheckPath,
      })
      .from(environmentDomains)
      .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
      .orderBy(asc(environmentDomains.name));

    return { addresses };
  }

  /**
   * Окружения с их адресами и результатом разрешения.
   *
   * Второй проход прогона: решение о машине принимается по окружению
   * целиком, а не по отдельному адресу — привязка у него одна.
   */
  async listDiscoveryTargets(): Promise<DiscoveryTarget[]> {
    const rows = await this.db
      .select({
        environmentId: environments.id,
        environmentName: environments.name,
        serverId: environments.serverId,
        name: environmentDomains.name,
        resolvedIp: domainStatuses.resolvedIp,
      })
      .from(environmentDomains)
      .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
      .leftJoin(domainStatuses, eq(domainStatuses.domainId, environmentDomains.id))
      .orderBy(asc(environments.name), asc(environmentDomains.name));

    const grouped = new Map<string, DiscoveryTarget>();

    for (const row of rows) {
      const target = grouped.get(row.environmentId) ?? {
        environmentId: row.environmentId,
        environmentName: row.environmentName,
        serverId: row.serverId,
        addresses: [],
      };

      target.addresses.push({ name: row.name, resolvedIp: row.resolvedIp });
      grouped.set(row.environmentId, target);
    }

    return [...grouped.values()];
  }

  /** Агрегированный статус проекта. Право — метаданные инфраструктуры. */
  async statusForProject(subject: RequestSubject, projectId: string): Promise<ProjectStatus> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    return this.buildStatus(projectId);
  }

  /**
   * Сводка по видимым проектам с уровнем на инфраструктуре.
   *
   * Проекты без такого уровня опускаются молча: их статус — часть
   * секции, на которую доступа нет.
   */
  async summary(subject: RequestSubject): Promise<StatusSummaryRow[]> {
    const visibleIds = await this.access.visibleProjectIds(subject);
    const rows: StatusSummaryRow[] = [];

    for (const projectId of visibleIds) {
      const levels = await this.access.levelsForProject(subject, projectId);

      if (!levels[Section.Infrastructure]) {
        continue;
      }

      const [project] = await this.db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const status = await this.buildStatus(projectId);

      rows.push({
        projectId,
        projectName: project?.name ?? '',
        indicator: status.indicator,
        warnings: status.warnings,
      });
    }

    return rows;
  }

  /**
   * Предупреждения о сроках оплаты машин, на которых стоят окружения проекта.
   *
   * По одному на машину, а не на окружение: два окружения одного проекта на
   * одном сервере — это одна оплата и одно предупреждение. В текст попадает
   * только имя машины: список её проектов не должен просачиваться в статус
   * чужого проекта.
   */
  private async serverWarningsFor(
    environmentRows: { environment: { serverId: string | null } }[],
    now: Date,
  ): Promise<StatusWarning[]> {
    const serverIds = [
      ...new Set(
        environmentRows
          .map((row) => row.environment.serverId)
          .filter((serverId): serverId is string => serverId !== null),
      ),
    ];

    if (serverIds.length === 0) {
      return [];
    }

    const machines = await this.db
      .select({ name: servers.name, paidUntil: servers.paidUntil })
      .from(servers)
      .where(inArray(servers.id, serverIds))
      .orderBy(asc(servers.name));

    return machines.flatMap((machine) => serverWarningsOf(machine.name, machine.paidUntil, now));
  }

  /**
   * Предупреждения о продлении корней, из которых растут домены проекта.
   *
   * По одному на корень: три поддомена одного домена — это одна оплата.
   * В тексте только имя корня, соседей по нему проекту знать незачем.
   */
  private async domainWarningsFor(
    environmentIds: string[],
    now: Date,
  ): Promise<StatusWarning[]> {
    if (environmentIds.length === 0) {
      return [];
    }

    const roots = await this.db
      .selectDistinct({ name: domains.name, paidUntil: domains.paidUntil })
      .from(environmentDomains)
      .innerJoin(domains, eq(domains.id, environmentDomains.domainId))
      .where(inArray(environmentDomains.environmentId, environmentIds))
      .orderBy(asc(domains.name));

    return roots.flatMap((root) => domainRenewalWarningsOf(root.name, root.paidUntil, now));
  }

  /** Собирает агрегат проекта из таблиц статусов. */
  private async buildStatus(projectId: string): Promise<ProjectStatus> {
    const [project] = await this.db
      .select({ lifecycle: projects.lifecycle })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const environmentRows = await this.db
      .select({ environment: environments })
      .from(environments)
      .where(eq(environments.projectId, projectId))
      .orderBy(asc(environments.kind), asc(environments.name));

    const environmentIds = environmentRows.map((row) => row.environment.id);
    const domainRows = environmentIds.length
      ? await this.db
          .select({ domain: environmentDomains, status: domainStatuses })
          .from(environmentDomains)
          .leftJoin(domainStatuses, eq(domainStatuses.domainId, environmentDomains.id))
          .where(inArray(environmentDomains.environmentId, environmentIds))
          .orderBy(asc(environmentDomains.name))
      : [];

    const domainStatusesView: DomainStatus[] = domainRows.map((row) => ({
      domainId: row.domain.id,
      environmentId: row.domain.environmentId,
      name: row.domain.name,
      health: row.status?.health ?? null,
      latencyMs: row.status?.latencyMs ?? null,
      healthError: row.status?.healthError ?? null,
      resolvedIp: row.status?.resolvedIp ?? null,
      resolveError: row.status?.resolveError ?? null,
      tlsValidTo: row.status?.tlsValidTo?.toISOString() ?? null,
      tlsError: row.status?.tlsError ?? null,
      registryExpiresAt: row.status?.registryExpiresAt?.toISOString() ?? null,
      registryError: row.status?.registryError ?? null,
      checkedAt: row.status?.checkedAt.toISOString() ?? null,
    }));

    // Здоровье окружения выводится из его адресов, а не хранится: правило
    // того же рода, что прогресс версии в роадмапе.
    const environmentStatusesView: EnvironmentStatus[] = environmentStatusesOf(
      environmentRows.map((row) => ({ id: row.environment.id, name: row.environment.name })),
      domainStatusesView,
    );

    const now = new Date();
    const serverWarnings = await this.serverWarningsFor(environmentRows, now);
    const domainWarnings = await this.domainWarningsFor(environmentIds, now);
    const registryWarnings = [...serverWarnings, ...domainWarnings];

    return {
      indicator: indicatorOf(project!.lifecycle, domainStatusesView, now, registryWarnings),
      environments: environmentStatusesView,
      domains: domainStatusesView,
      warnings: [...warningsOf(domainStatusesView, now), ...registryWarnings],
    };
  }
}
