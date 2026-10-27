import {
  AccessLevel,
  EnvironmentKind,
  Section,
  type PlatformRef,
  type ProjectCreate,
  type ProjectDetail,
  type ProjectListItem,
  type ProjectMetadata,
  type ProjectUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import {
  environmentDomains,
  environments,
  projectPlatforms,
  projects,
  servers,
  type Project,
} from '../db/schema';
import { projectListItemProjection } from './project-list.projection';
import { projectProjection } from './project.projection';
import { generateSlug } from './slug';

/**
 * Доступ к проектам.
 *
 * Каждый метод принимает субъект первым аргументом и проверяет права внутри:
 * отдельного вызова проверки, который можно забыть, не существует (спека 5.4).
 *
 * Методы записи дополнительно принимают транзакцию, потому что вызывающий
 * сервис пишет в журнал в той же транзакции (спека 7.3).
 *
 * Единственное исключение — {@link create}: при создании идентификатора
 * проекта ещё нет, а сервис прав работает именно по нему (спека 4.4). Право
 * создавать проект принадлежит только суперадмину, поэтому метод проверяет
 * этот признак сам, не обращаясь к сервису прав.
 */
@Injectable()
export class ProjectsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Возвращает проект в проекции, соответствующей уровню доступа субъекта. */
  async findById(
    subject: RequestSubject,
    projectId: string,
  ): Promise<ProjectMetadata | ProjectDetail> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Info,
      AccessLevel.Metadata,
    );

    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      throw new SectionNotVisibleError();
    }

    return projectProjection(project, level);
  }

  /**
   * Возвращает видимые субъекту проекты как строки сводки.
   *
   * Обзорные поля Info/Infra наполняются по уровню секции; полный паспорт
   * по-прежнему только у detail. Статус сюда не входит — его отдаёт
   * `/status/summary`. Обогащение батчами, без N+1 по проектам.
   */
  async findVisible(subject: RequestSubject): Promise<ProjectListItem[]> {
    const ids = await this.access.visibleProjectIds(subject);

    if (ids.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(projects)
      .where(inArray(projects.id, ids))
      .orderBy(asc(projects.name));

    const levelsByProject = await this.access.levelsForProjects(subject, ids);
    const platformsByProject = await this.platformsByProject(ids);
    const productionByProject = await this.productionOverviewByProject(ids);

    return rows.map((row) => {
      const production = productionByProject.get(row.id);

      return projectListItemProjection(
        row,
        levelsByProject.get(row.id) ?? {},
        platformsByProject.get(row.id) ?? [],
        production?.domain ?? null,
        production?.serverName ?? null,
      );
    });
  }

  /**
   * Создаёт проект, подбирая свободный слаг.
   *
   * Проверяет признак суперадмина напрямую: сервису прав нужен идентификатор
   * проекта, которого здесь ещё не существует (спека 4.4).
   */
  async create(subject: RequestSubject, tx: Executor, input: ProjectCreate): Promise<Project> {
    if (!subject.isSuperadmin || subject.isRevoked) {
      throw new InsufficientLevelError();
    }

    // Платформы — не колонка таблицы: Drizzle молча пропустил бы лишнее
    // поле, и проект создался бы без них незаметно. Их заводит служба.
    const { platforms: _platforms, ...fields } = input;
    const slug = await this.findFreeSlug(tx, generateSlug(fields.name));

    const [created] = await tx
      .insert(projects)
      .values({ ...fields, slug })
      .returning();

    return created!;
  }

  /** Изменяет поля паспорта проекта. Требует уровень записи. Слаг не меняется. */
  async update(
    subject: RequestSubject,
    tx: Executor,
    projectId: string,
    input: ProjectUpdate,
  ): Promise<Project> {
    // Проверка идёт тем же исполнителем, что и сама правка: внутри транзакции
    // обращение к другому подключению увидело бы состояние до неё, а при
    // единственном подключении в пуле — заблокировалось бы навсегда.
    await this.access.requireLevel(subject, projectId, Section.Info, AccessLevel.Write, tx);

    const [updated] = await tx
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();

    if (!updated) {
      throw new SectionNotVisibleError();
    }

    return updated;
  }

  /** Платформы видимых проектов, сгруппированные и упорядоченные по position. */
  private async platformsByProject(projectIds: string[]): Promise<Map<string, PlatformRef[]>> {
    const rows = await this.db
      .select({
        id: projectPlatforms.id,
        projectId: projectPlatforms.projectId,
        kind: projectPlatforms.kind,
        name: projectPlatforms.name,
      })
      .from(projectPlatforms)
      .where(inArray(projectPlatforms.projectId, projectIds))
      .orderBy(asc(projectPlatforms.position));

    const result = new Map<string, PlatformRef[]>();

    for (const row of rows) {
      const list = result.get(row.projectId) ?? [];
      list.push({ id: row.id, kind: row.kind, name: row.name });
      result.set(row.projectId, list);
    }

    return result;
  }

  /**
   * Прод-обзор по проектам: одно production-окружение (name ASC),
   * первый домен (name ASC), имя машины.
   */
  private async productionOverviewByProject(
    projectIds: string[],
  ): Promise<Map<string, { domain: string | null; serverName: string | null }>> {
    const envRows = await this.db
      .select({
        id: environments.id,
        projectId: environments.projectId,
        serverId: environments.serverId,
        name: environments.name,
      })
      .from(environments)
      .where(
        and(
          inArray(environments.projectId, projectIds),
          eq(environments.kind, EnvironmentKind.Production),
        ),
      )
      .orderBy(asc(environments.name));

    const chosenEnv = new Map<string, (typeof envRows)[number]>();

    for (const row of envRows) {
      if (!chosenEnv.has(row.projectId)) {
        chosenEnv.set(row.projectId, row);
      }
    }

    const envIds = [...chosenEnv.values()].map((row) => row.id);
    const domainByEnv = new Map<string, string>();

    if (envIds.length > 0) {
      const domainRows = await this.db
        .select({
          environmentId: environmentDomains.environmentId,
          name: environmentDomains.name,
        })
        .from(environmentDomains)
        .where(inArray(environmentDomains.environmentId, envIds))
        .orderBy(asc(environmentDomains.name));

      for (const row of domainRows) {
        if (!domainByEnv.has(row.environmentId)) {
          domainByEnv.set(row.environmentId, row.name);
        }
      }
    }

    const serverIds = [
      ...new Set(
        [...chosenEnv.values()]
          .map((row) => row.serverId)
          .filter((serverId): serverId is string => serverId !== null),
      ),
    ];
    const serverNameById = new Map<string, string>();

    if (serverIds.length > 0) {
      const serverRows = await this.db
        .select({ id: servers.id, name: servers.name })
        .from(servers)
        .where(inArray(servers.id, serverIds));

      for (const row of serverRows) {
        serverNameById.set(row.id, row.name);
      }
    }

    const result = new Map<string, { domain: string | null; serverName: string | null }>();

    for (const [projectId, env] of chosenEnv) {
      result.set(projectId, {
        domain: domainByEnv.get(env.id) ?? null,
        serverName: env.serverId ? (serverNameById.get(env.serverId) ?? null) : null,
      });
    }

    return result;
  }

  /** Подбирает свободный слаг, дополняя базовый числовым суффиксом. */
  private async findFreeSlug(tx: Executor, base: string): Promise<string> {
    for (let suffix = 0; suffix < MAX_SLUG_ATTEMPTS; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const [existing] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.slug, candidate))
        .limit(1);

      if (!existing) {
        return candidate;
      }
    }

    throw new Error(`Не удалось подобрать свободный слаг для «${base}»`);
  }
}

/** Предел перебора суффиксов слага. */
const MAX_SLUG_ATTEMPTS = 100;
