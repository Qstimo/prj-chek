import {
  AccessLevel,
  PlatformKind,
  Section,
  type Platform,
  type PlatformCreate,
  type PlatformUpdate,
} from '@cairn/shared';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import {
  checkpointPlatforms,
  environmentPlatforms,
  environments,
  projectPlatforms,
  versionPlatformReleases,
  type ProjectPlatformRow,
} from '../db/schema';

/**
 * Платформы проекта: каналы поставки (дизайн 4.1).
 *
 * Платформа — поле паспорта, поэтому права проверяются по секции «Инфо».
 * Каждый метод с субъектом проверяет уровень сам и тем же исполнителем,
 * которым работает: внутри транзакции обращение к другому подключению
 * увидело бы состояние до неё.
 */
@Injectable()
export class PlatformsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Платформы проекта по порядку. */
  async findForProject(subject: RequestSubject, projectId: string): Promise<Platform[]> {
    await this.access.requireLevel(subject, projectId, Section.Info, AccessLevel.Metadata);

    const rows = await this.db
      .select()
      .from(projectPlatforms)
      .where(eq(projectPlatforms.projectId, projectId))
      .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));

    return rows.map(platformProjection);
  }

  /** Заводит платформу в конце списка. */
  async create(
    subject: RequestSubject,
    tx: Executor,
    projectId: string,
    input: PlatformCreate,
  ): Promise<ProjectPlatformRow> {
    await this.access.requireLevel(subject, projectId, Section.Info, AccessLevel.Write, tx);

    const existing = await tx
      .select({ position: projectPlatforms.position, name: projectPlatforms.name })
      .from(projectPlatforms)
      .where(eq(projectPlatforms.projectId, projectId));

    // Ограничение уникальности есть и в базе, но человеку нужен внятный
    // отказ, а не 500 от сырого нарушения ключа.
    if (existing.some((row) => row.name === input.name)) {
      throw new ConflictException('Платформа с таким именем уже есть в проекте.');
    }

    const [created] = await tx
      .insert(projectPlatforms)
      .values({
        projectId,
        kind: input.kind,
        name: input.name,
        position: Math.max(0, ...existing.map((row) => row.position)) + 1,
      })
      .returning();

    return created!;
  }

  /**
   * Заводит платформы списком — при создании проекта.
   *
   * Признак суперадмина проверяется напрямую, как в
   * `ProjectsRepository.create`: выдачи на только что созданный проект
   * ещё не существует, и спросить службу прав нечего. Отзыв проверяется
   * наравне с признаком — метод экспортируется вместе с модулем, и без
   * этого любой будущий вызывающий заводил бы платформы где угодно.
   *
   * Позиции раздаются по месту в списке: порядок платформ проекта должен
   * совпасть с тем, в котором их перечислили в форме.
   */
  async createMany(
    subject: RequestSubject,
    tx: Executor,
    projectId: string,
    inputs: PlatformCreate[],
  ): Promise<ProjectPlatformRow[]> {
    if (!subject.isSuperadmin || subject.isRevoked) {
      throw new InsufficientLevelError();
    }

    if (inputs.length === 0) {
      return [];
    }

    return tx
      .insert(projectPlatforms)
      .values(
        inputs.map((input, index) => ({
          projectId,
          kind: input.kind,
          name: input.name,
          position: index + 1,
        })),
      )
      .returning();
  }

  /** Правит имя платформы. Вид и позиция не правятся (дизайн 4.1). */
  async update(
    subject: RequestSubject,
    tx: Executor,
    projectId: string,
    platformId: string,
    input: PlatformUpdate,
  ): Promise<ProjectPlatformRow> {
    await this.access.requireLevel(subject, projectId, Section.Info, AccessLevel.Write, tx);
    await this.requireInProject(tx, projectId, platformId);

    const [duplicate] = await tx
      .select({ id: projectPlatforms.id })
      .from(projectPlatforms)
      .where(
        and(eq(projectPlatforms.projectId, projectId), eq(projectPlatforms.name, input.name)),
      )
      .limit(1);

    if (duplicate && duplicate.id !== platformId) {
      throw new ConflictException('Платформа с таким именем уже есть в проекте.');
    }

    const [updated] = await tx
      .update(projectPlatforms)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(projectPlatforms.id, platformId))
      .returning();

    return updated!;
  }

  /**
   * Удаляет платформу вместе с выпусками, тегами и связями.
   *
   * Явными строками, без каскада: на всех ссылках `restrict`, и удаление
   * без уборки упёрлось бы в ссылочную целостность.
   */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    platformId: string,
  ): Promise<ProjectPlatformRow> {
    await this.access.requireLevel(subject, projectId, Section.Info, AccessLevel.Write, tx);

    const platform = await this.requireInProject(tx, projectId, platformId);

    await tx.delete(checkpointPlatforms).where(eq(checkpointPlatforms.platformId, platformId));
    await tx
      .delete(versionPlatformReleases)
      .where(eq(versionPlatformReleases.platformId, platformId));
    await tx.delete(environmentPlatforms).where(eq(environmentPlatforms.platformId, platformId));
    await tx.delete(projectPlatforms).where(eq(projectPlatforms.id, platformId));

    return platform;
  }

  /**
   * Платформы, развёрнутые в окружении.
   *
   * Набор заменяется целиком: он правится целиком в одной форме. Магазин
   * в окружение не ставится — у него нет ни машины, ни адреса, и запись
   * об этом была бы ложью о том, где он живёт.
   *
   * Субъекта не принимает, как и `DomainsRepository.ensureRoot`: зовётся
   * из репозитория окружений, который уже проверил «Инфраструктуру» и
   * принадлежность окружения проекту, а проект платформ берётся из самой
   * строки окружения — обойти проверку нечем.
   */
  async setEnvironmentPlatforms(
    tx: Transaction,
    environmentId: string,
    platformIds: string[],
  ): Promise<void> {
    const [environment] = await tx
      .select({ projectId: environments.projectId })
      .from(environments)
      .where(eq(environments.id, environmentId))
      .limit(1);

    if (!environment) {
      throw new SectionNotVisibleError();
    }

    const unique = [...new Set(platformIds)];

    const chosen = unique.length
      ? await tx
          .select()
          .from(projectPlatforms)
          .where(
            and(
              eq(projectPlatforms.projectId, environment.projectId),
              inArray(projectPlatforms.id, unique),
            ),
          )
      : [];

    // Сравнение с размером множества, а не длиной массива: повтор
    // в запросе иначе дал бы ложный 404. Схема повторы и так отвергает,
    // но точка контроля — репозиторий.
    if (chosen.length !== unique.length) {
      throw new SectionNotVisibleError();
    }

    const foreign = chosen.find((platform) => platform.kind !== PlatformKind.Server);

    if (foreign) {
      // Текст общий: правило отвергает и магазин, и «иное» — у пакета
      // в реестре машины и адреса тоже нет.
      throw new ConflictException(
        `Платформа «${foreign.name}» не живёт в окружении: окружение есть только у того, что развёрнуто на наших машинах.`,
      );
    }

    await tx
      .delete(environmentPlatforms)
      .where(eq(environmentPlatforms.environmentId, environmentId));

    if (unique.length) {
      await tx
        .insert(environmentPlatforms)
        .values(unique.map((platformId) => ({ environmentId, platformId })));
    }
  }

  /** Платформа обязана принадлежать проекту из адреса. */
  async requireInProject(
    executor: Executor,
    projectId: string,
    platformId: string,
  ): Promise<ProjectPlatformRow> {
    const [platform] = await executor
      .select()
      .from(projectPlatforms)
      .where(
        and(eq(projectPlatforms.id, platformId), eq(projectPlatforms.projectId, projectId)),
      )
      .limit(1);

    if (!platform) {
      throw new SectionNotVisibleError();
    }

    return platform;
  }
}

/** Приводит строку к контракту: наружу не уходят проект и отметки времени. */
function platformProjection(row: ProjectPlatformRow): Platform {
  return { id: row.id, kind: row.kind, name: row.name, position: row.position };
}
