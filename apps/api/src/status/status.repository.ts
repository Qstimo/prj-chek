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
import { asc, eq, inArray, isNotNull } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import {
  domainStatuses,
  environmentDomains,
  environmentStatuses,
  environments,
  projects,
  servers,
} from '../db/schema';
import { indicatorOf, serverWarningsOf, warningsOf } from './indicator';

/** Результат health-проверки для записи. */
export interface EnvironmentStatusInput {
  health: HealthState;
  latencyMs: number | null;
  error: string | null;
}

/** Результат проверок домена для записи. */
export interface DomainStatusInput {
  tlsValidTo: Date | null;
  tlsError: string | null;
  registryExpiresAt: Date | null;
  registryError: string | null;
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

  /** Пишет результат health-проверки: одна строка на окружение. */
  async upsertEnvironmentStatus(
    environmentId: string,
    input: EnvironmentStatusInput,
  ): Promise<void> {
    await this.db
      .insert(environmentStatuses)
      .values({ environmentId, ...input, checkedAt: new Date() })
      .onConflictDoUpdate({
        target: environmentStatuses.environmentId,
        set: { ...input, checkedAt: new Date() },
      });
  }

  /** Пишет результат проверок домена: одна строка на домен. */
  async upsertDomainStatus(domainId: string, input: DomainStatusInput): Promise<void> {
    await this.db
      .insert(domainStatuses)
      .values({ domainId, ...input, checkedAt: new Date() })
      .onConflictDoUpdate({
        target: domainStatuses.domainId,
        set: { ...input, checkedAt: new Date() },
      });
  }

  /** Цели проверок: окружения с адресом health-check и все домены. */
  async listTargets(): Promise<{
    environments: { id: string; healthCheckUrl: string }[];
    domains: { id: string; name: string }[];
  }> {
    const environmentRows = await this.db
      .select({ id: environments.id, healthCheckUrl: environments.healthCheckUrl })
      .from(environments)
      .where(isNotNull(environments.healthCheckUrl));

    const domainRows = await this.db
      .select({ id: environmentDomains.id, name: environmentDomains.name })
      .from(environmentDomains);

    return {
      environments: environmentRows.map((row) => ({
        id: row.id,
        healthCheckUrl: row.healthCheckUrl!,
      })),
      domains: domainRows,
    };
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

  /** Собирает агрегат проекта из таблиц статусов. */
  private async buildStatus(projectId: string): Promise<ProjectStatus> {
    const [project] = await this.db
      .select({ lifecycle: projects.lifecycle })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const environmentRows = await this.db
      .select({ environment: environments, status: environmentStatuses })
      .from(environments)
      .leftJoin(environmentStatuses, eq(environmentStatuses.environmentId, environments.id))
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

    const environmentStatusesView: EnvironmentStatus[] = environmentRows.map((row) => ({
      environmentId: row.environment.id,
      name: row.environment.name,
      health: row.status?.health ?? null,
      latencyMs: row.status?.latencyMs ?? null,
      error: row.status?.error ?? null,
      checkedAt: row.status?.checkedAt.toISOString() ?? null,
    }));

    const domainStatusesView: DomainStatus[] = domainRows.map((row) => ({
      domainId: row.domain.id,
      name: row.domain.name,
      tlsValidTo: row.status?.tlsValidTo?.toISOString() ?? null,
      tlsError: row.status?.tlsError ?? null,
      registryExpiresAt: row.status?.registryExpiresAt?.toISOString() ?? null,
      registryError: row.status?.registryError ?? null,
      checkedAt: row.status?.checkedAt.toISOString() ?? null,
    }));

    const now = new Date();
    const serverWarnings = await this.serverWarningsFor(environmentRows, now);

    return {
      indicator: indicatorOf(
        project!.lifecycle,
        environmentStatusesView,
        domainStatusesView,
        now,
        serverWarnings,
      ),
      environments: environmentStatusesView,
      domains: domainStatusesView,
      warnings: [...warningsOf(environmentStatusesView, domainStatusesView, now), ...serverWarnings],
    };
  }
}
