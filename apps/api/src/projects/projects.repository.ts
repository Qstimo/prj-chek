import {
  AccessLevel,
  Section,
  type ProjectCreate,
  type ProjectDetail,
  type ProjectMetadata,
  type ProjectUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { projects, type Project } from '../db/schema';
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
   * Возвращает список видимых субъекту проектов в проекции метаданных.
   *
   * Проекция всегда метаданных, даже если уровень выше: список — это обзор,
   * подробности показывает карточка проекта. Отдавать в списке полный
   * паспорт значило бы гонять лишние данные при каждом открытии сводки.
   */
  async findVisible(subject: RequestSubject): Promise<ProjectMetadata[]> {
    const ids = await this.access.visibleProjectIds(subject);

    if (ids.length === 0) {
      return [];
    }

    const rows = await this.db.select().from(projects).where(inArray(projects.id, ids));

    return rows.map((row) => projectProjection(row, AccessLevel.Metadata) as ProjectMetadata);
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

    const slug = await this.findFreeSlug(tx, generateSlug(input.name));

    const [created] = await tx
      .insert(projects)
      .values({ ...input, slug })
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
