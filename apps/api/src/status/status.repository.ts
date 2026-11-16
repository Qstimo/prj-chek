import {
  AccessLevel,
  HealthState,
  ProjectLifecycle,
  Section,
  StatusCheckCode,
  StatusWarningKind,
  type DomainStatus,
  type EnvironmentStatus,
  type ProjectStatus,
  type StatusSummaryRow,
  type StatusWarning,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray, ne, sql } from 'drizzle-orm';

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
import { machineWarningsOf } from '../servers/server-discovery';
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
  /** Что увидела проверка доступности; `null` — чистый `2xx`. */
  healthCode: StatusCheckCode | null;
  /** Куда ведёт перенаправление, если оно было. */
  redirectTo: string | null;
  /**
   * Все адреса, в которые разрешилось имя.
   *
   * Множество, а не выбранный адрес: выбор канонического делает
   * репозиторий — привязка у окружения одна, и правило выбора должно быть
   * одно. Пустой список при непустом `resolveError` означает «не узнали
   * сейчас», и прежнее знание не затирается.
   */
  resolvedIps: string[];
  resolveError: string | null;
  tlsValidTo: Date | null;
  /** Приняла ли система сертификат; `null` — рукопожатия не было. */
  tlsTrusted: boolean | null;
  tlsCode: StatusCheckCode | null;
  tlsError: string | null;
  registryExpiresAt: Date | null;
  registryError: string | null;
}

/** Адрес окружения как цель обхода: имя, путь ручки и чей он. */
export interface AddressTarget {
  id: string;
  name: string;
  /**
   * Корень, из которого растёт адрес: его и спрашивают у реестра.
   *
   * Реестры знают только то, за что платят, и пока вопрос задавался по
   * имени адреса, у каждого поддомена висело вечное «реестр ответил
   * HTTP 404». Корень берётся связью `environment_domains.domainId`, а не
   * разбором имени: список зон с именами третьего уровня у нас закрытый
   * и неполон по устройству, а эта связь — то, что сказал человек.
   */
  rootDomain: string;
  healthCheckPath: string | null;
  /** Проект адреса: по нему считаются адресаты уведомления. */
  projectId: string;
  projectName: string;
  environmentName: string;
  /** Жизненный цикл проекта: приостановленный инцидентов не открывает. */
  lifecycle: ProjectLifecycle;
}

/** Итог переспроса: только здоровье, сроки переспрашивать незачем. */
export interface AddressHealthInput {
  health: HealthState;
  latencyMs: number | null;
  healthError: string | null;
  healthCode: StatusCheckCode | null;
  redirectTo: string | null;
}

/** Окружение со своими адресами: цель второго прохода прогона. */
export interface DiscoveryTarget {
  environmentId: string;
  environmentName: string;
  serverId: string | null;
  /**
   * Адреса окружения со всеми адресами разрешения.
   *
   * Множество, а не выбранный адрес: правило о машине решает по нему —
   * имя с двумя адресами не говорит, какая из машин та самая, а имя за
   * CDN не говорит о машине вовсе.
   */
  addresses: { name: string; resolvedIps: string[] }[];
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

  /** Замок с парой целых ключей хранится в pg_locks с objsubid = 2. */
  async isCheckRunning(): Promise<boolean> {
    const rows = (await this.db.execute(sql`select exists (
      select 1 from pg_locks
      where locktype = 'advisory' and granted
        and database = (select oid from pg_database where datname = current_database())
        and classid = ${0x43414952}::oid and objid = 1::oid and objsubid = 2
    ) as running`)) as unknown as { running: boolean }[];
    return rows[0]?.running === true;
  }

  /**
   * Пишет результат проверок адреса: одна строка на адрес.
   *
   * Выбор канонического адреса из множества делается здесь, а не в
   * прогоне: привязка у окружения одна, и выбирать её надо так, чтобы
   * выбор не менялся от прогона к прогону — наименьший из упорядоченного
   * множества выполняет это условие сам.
   *
   * Отказ разрешения не затирает прежние адреса: потерянный ответ DNS не
   * повод объявить, что имя никуда не смотрит. Причина при этом
   * записывается — человек увидит и адрес, и то, что сейчас его не
   * подтвердили.
   */
  async upsertAddressStatus(domainId: string, input: AddressStatusInput): Promise<void> {
    const { resolvedIps, ...rest } = input;
    const checkedAt = new Date();
    const resolution = { resolvedIp: canonicalIpOf(resolvedIps), resolvedIps };
    // Отказ при пустом множестве — «не узнали сейчас», а не «никуда не
    // смотрит»: прежнюю запись о разрешении такой прогон не трогает.
    const keepsResolution = resolvedIps.length === 0 && input.resolveError !== null;

    await this.db
      .insert(domainStatuses)
      .values({ domainId, ...rest, ...resolution, checkedAt })
      .onConflictDoUpdate({
        target: domainStatuses.domainId,
        set: { ...rest, ...(keepsResolution ? {} : resolution), checkedAt },
      });
  }

  /**
   * Пишет итог переспроса: только здоровье.
   *
   * Отдельно от `upsertAddressStatus`, потому что переспрашивается один
   * health: TLS, разрешение имени и срок регистрации за полминуты не
   * меняются, а перезапись их пустыми затёрла бы работу первой фазы.
   *
   * Строки может не оказаться — адрес сняли между фазами прогона. Тогда
   * обновление не затронет ничего, и об этом говорит возвращаемое
   * значение: молчаливый `UPDATE` читался вызывающим как успех, и прогон
   * сводил инцидент по вердикту, которого в базе нет.
   *
   * @returns была ли строка статуса, которую обновили.
   */
  async updateAddressHealth(domainId: string, input: AddressHealthInput): Promise<boolean> {
    const updated = await this.db
      .update(domainStatuses)
      .set({ ...input, checkedAt: new Date() })
      .where(eq(domainStatuses.domainId, domainId))
      .returning({ id: domainStatuses.id });

    return updated.length > 0;
  }

  /**
   * Цели проверок — адреса окружений.
   *
   * Одна цель вместо двух списков: у окружения нет адреса помимо доменов,
   * и путь проверки идёт вместе с именем, по которому её делать.
   *
   * Проект приезжает вместе с адресом: сведение инцидентов решает по его
   * жизненному циклу, а текст уведомления называет проект и окружение, —
   * отдельный запрос за теми же полями был бы лишним.
   *
   * Архивные проекты в цели не попадают: архив никто не чинит и не
   * поднимает, а снятый домен мёртвого проекта открывал инцидент и будил
   * человека пушем каждые четверть часа. Пауза, в отличие от архива,
   * проверяется: вернуться из неё обещано, и о том, что стенд поднялся,
   * человеку сказать есть что.
   */
  async listTargets(): Promise<{ addresses: AddressTarget[] }> {
    const addresses = await this.db
      .select({
        id: environmentDomains.id,
        name: environmentDomains.name,
        rootDomain: domains.name,
        healthCheckPath: environments.healthCheckPath,
        projectId: projects.id,
        projectName: projects.name,
        environmentName: environments.name,
        lifecycle: projects.lifecycle,
      })
      .from(environmentDomains)
      .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
      .innerJoin(projects, eq(projects.id, environments.projectId))
      // Корень есть у каждого адреса: его заводит сам факт появления
      // адреса в окружении, поэтому соединение внутреннее.
      .innerJoin(domains, eq(domains.id, environmentDomains.domainId))
      .where(ne(projects.lifecycle, ProjectLifecycle.Archived))
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
        resolvedIps: domainStatuses.resolvedIps,
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

      // Строка, записанная до появления колонки, множества не знает:
      // пустой список — честный ответ «адресов не видели».
      target.addresses.push({ name: row.name, resolvedIps: row.resolvedIps ?? [] });
      grouped.set(row.environmentId, target);
    }

    return [...grouped.values()];
  }

  /**
   * Агрегированный статус проекта. Право — метаданные инфраструктуры.
   *
   * Предупреждения реестров собираются только суперадмину: имя машины и
   * имя корня принадлежат реестрам, закрытым его правом целиком, и
   * уровень «метаданные» на секции проекта к ним доступа не даёт. Запрос
   * за ними в этом случае не делается вовсе — нечего и фильтровать.
   */
  async statusForProject(subject: RequestSubject, projectId: string): Promise<ProjectStatus> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    // Замок читается после проверки прав, но до снимка: если прогон
    // завершится во время чтения, ещё один быстрый опрос получит итог.
    const runningBefore = await this.isCheckRunning();
    const status = await this.buildStatus(projectId, { withRegistry: subject.isSuperadmin });

    return { ...status, checkRunning: runningBefore || await this.isCheckRunning() };
  }

  /**
   * Сводка по видимым проектам с уровнем на инфраструктуре.
   *
   * Проекты без такого уровня опускаются молча: их статус — часть
   * секции, на которую доступа нет.
   *
   * Предупреждений реестров в сводке нет ни у кого, включая суперадмина:
   * у строки сводки нет для них отдельного места, а индикатор они не
   * красят — показать их здесь значило бы вернуть красный, на который
   * проекту нечем ответить. Сроки машин и корней живут на своих экранах,
   * у тех, кто их и продлевает.
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
      const status = await this.buildStatus(projectId, { withRegistry: false });

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

  /**
   * Предупреждения о машине: адрес смотрит не туда, адреса разошлись.
   *
   * Правило то же, что у прогона, и живёт в одном с ним месте: второй
   * его экземпляр разошёлся бы с первым. Из машины берётся один только
   * адрес — имя сервера принадлежит уровню «чтение» и в статус не идёт.
   */
  private async machineWarningsFor(
    environmentRows: { environment: { id: string; name: string; serverId: string | null } }[],
    addresses: DomainStatus[],
  ): Promise<StatusWarning[]> {
    const boundIps = await this.boundIpsOf(environmentRows.map((row) => row.environment));

    return environmentRows.flatMap((row) =>
      machineWarningsOf({
        environmentName: row.environment.name,
        isBound: row.environment.serverId !== null,
        boundIp: row.environment.serverId
          ? (boundIps.get(row.environment.serverId) ?? null)
          : null,
        addresses: addresses
          .filter((address) => address.environmentId === row.environment.id)
          .map((address) => ({ name: address.name, resolvedIps: address.resolvedIps })),
      }),
    );
  }

  /** Адреса привязанных машин по их идентификаторам. */
  private async boundIpsOf(
    environmentRows: { serverId: string | null }[],
  ): Promise<Map<string, string | null>> {
    const serverIds = [
      ...new Set(
        environmentRows
          .map((row) => row.serverId)
          .filter((serverId): serverId is string => serverId !== null),
      ),
    ];

    if (serverIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({ id: servers.id, ip: servers.ip })
      .from(servers)
      .where(inArray(servers.id, serverIds));

    return new Map(rows.map((row) => [row.id, row.ip]));
  }

  /**
   * Собирает агрегат проекта из таблиц статусов.
   *
   * @param options.withRegistry собирать ли предупреждения реестров —
   * сроки машин, сроки корней, расхождение привязки. Решение о праве
   * принято выше: здесь только работа.
   */
  private async buildStatus(
    projectId: string,
    options: { withRegistry: boolean },
  ): Promise<ProjectStatus> {
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
      healthCode: row.status?.healthCode ?? null,
      redirectTo: row.status?.redirectTo ?? null,
      resolvedIp: row.status?.resolvedIp ?? null,
      // Строка, записанная до появления колонки, множества не знает:
      // пустой список — честный ответ «адресов не видели».
      resolvedIps: row.status?.resolvedIps ?? [],
      resolveError: row.status?.resolveError ?? null,
      tlsValidTo: row.status?.tlsValidTo?.toISOString() ?? null,
      tlsTrusted: row.status?.tlsTrusted ?? null,
      tlsCode: row.status?.tlsCode ?? null,
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
    const lifecycle = project!.lifecycle;
    const registryWarnings = options.withRegistry
      ? [
          ...(await this.serverWarningsFor(environmentRows, now)),
          ...(await this.domainWarningsFor(environmentIds, now)),
          ...(await this.machineWarningsFor(environmentRows, domainStatusesView)),
        ]
      : [];

    return {
      // Предупреждения реестра в индикатор не входят: межпроектную машину
      // и корневой домен правит суперадмин, и проекту по такому
      // предупреждению делать нечего.
      indicator: indicatorOf(lifecycle, observedOf(lifecycle, domainStatusesView), now),
      environments: environmentStatusesView,
      domains: domainStatusesView,
      warnings: addressWarningsOf(lifecycle, domainStatusesView, now),
      registryWarnings,
    };
  }
}

/**
 * Предупреждения по адресам с оглядкой на жизненный цикл проекта.
 *
 * Жизненный цикл — это заявленное намерение, и предупреждение обязано
 * ему не противоречить. Приостановленный стенд погашен нарочно: красное
 * «не отвечает» рядом с индикатором «Приостановлен» спорило с ним же в
 * одном ответе. Об истекающем сертификате того же стенда сказать по-
 * прежнему есть что — это не авария, а срок, который придётся продлить
 * до возвращения.
 *
 * Архив молчит целиком: его адреса больше не проверяются (см.
 * {@link StatusRepository.listTargets}), и показывать предупреждения по
 * последнему известному состоянию значило бы просить о действии там, где
 * действовать уже никто не станет.
 */
function addressWarningsOf(
  lifecycle: ProjectLifecycle,
  domains: DomainStatus[],
  now: Date,
): StatusWarning[] {
  if (lifecycle === ProjectLifecycle.Archived) {
    return [];
  }

  const warnings = warningsOf(domains, now);

  return lifecycle === ProjectLifecycle.Paused
    ? warnings.filter((warning) => warning.kind !== StatusWarningKind.HealthDown)
    : warnings;
}

/**
 * Адреса, по которым индикатору позволено судить.
 *
 * У архива — ни одного: его никто не проверяет, и последнее известное
 * «не отвечает» так и осталось бы красным навсегда. Индикатор в этом
 * случае отвечает «неизвестно» — ровно то, что система об архиве и
 * знает. Пауза отсекается самим правилом индикатора раньше адресов.
 */
function observedOf(lifecycle: ProjectLifecycle, domains: DomainStatus[]): DomainStatus[] {
  return lifecycle === ProjectLifecycle.Archived ? [] : domains;
}

/**
 * Какой из адресов имени считать тем самым.
 *
 * Наименьший: привязка у окружения одна, а резолверы ротируют порядок
 * ответа — пока бралась первая запись, привязка плясала от прогона к
 * прогону вместе с ней. Правило живёт здесь одно на запись и на чтение.
 */
function canonicalIpOf(ips: string[]): string | null {
  return [...ips].sort()[0] ?? null;
}
