import {
  type AccessLevel,
  type GrantMatrixRow,
  type GrantRevoke,
  type GrantSet,
  type Section,
  type UserGrantRow,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { grants, projects, subjects } from '../db/schema';

/**
 * Доступ к выдачам.
 *
 * Субъект-инициатор здесь не проверяется: управлять выдачами вправе только
 * суперадмин, и это проверяет guard на уровне контроллера (спека 4.3).
 * Дублировать проверку здесь значило бы завести второе место, где правило
 * может разойтись.
 */
@Injectable()
export class GrantsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Устанавливает уровень доступа для пары «субъект × секция».
   *
   * Возвращает прежний уровень либо `null`, если выдачи не было: журналу
   * нужно отличать первое назначение от повышения и понижения.
   */
  async set(
    tx: Executor,
    projectId: string,
    grantedBy: string,
    input: GrantSet,
  ): Promise<AccessLevel | null> {
    const [existing] = await tx
      .select({ level: grants.level })
      .from(grants)
      .where(
        and(
          eq(grants.subjectId, input.subjectId),
          eq(grants.projectId, projectId),
          eq(grants.section, input.section),
        ),
      )
      .limit(1);

    await tx
      .insert(grants)
      .values({
        subjectId: input.subjectId,
        projectId,
        section: input.section,
        level: input.level,
        grantedBy,
      })
      .onConflictDoUpdate({
        target: [grants.subjectId, grants.projectId, grants.section],
        set: { level: input.level, grantedBy, grantedAt: new Date() },
      });

    return existing?.level ?? null;
  }

  /**
   * Отзывает выдачу удалением строки.
   *
   * Возвращает признак того, была ли выдача: вызывающий сервис пишет в журнал
   * только состоявшийся отзыв.
   */
  async revoke(tx: Executor, projectId: string, input: GrantRevoke): Promise<boolean> {
    const removed = await tx
      .delete(grants)
      .where(
        and(
          eq(grants.subjectId, input.subjectId),
          eq(grants.projectId, projectId),
          eq(grants.section, input.section),
        ),
      )
      .returning({ id: grants.id });

    return removed.length > 0;
  }

  /**
   * Собирает матрицу «субъект × секция» для проекта.
   *
   * Возвращает только субъектов, у которых есть хотя бы одна выдача.
   * Экрану управления доступами нужны и остальные — чтобы было кому выдать
   * доступ впервые; их он берёт отдельным запросом списка пользователей.
   */
  async matrixForProject(projectId: string): Promise<GrantMatrixRow[]> {
    const rows = await this.db
      .select({
        subjectId: grants.subjectId,
        section: grants.section,
        level: grants.level,
        subjectKind: subjects.kind,
        subjectLabel: subjects.label,
        revokedAt: subjects.revokedAt,
      })
      .from(grants)
      .innerJoin(subjects, eq(subjects.id, grants.subjectId))
      .where(eq(grants.projectId, projectId));

    const bySubject = new Map<string, GrantMatrixRow>();

    for (const row of rows) {
      const existing: GrantMatrixRow = bySubject.get(row.subjectId) ?? {
        subjectId: row.subjectId,
        subjectKind: row.subjectKind,
        subjectLabel: row.subjectLabel,
        isRevoked: row.revokedAt !== null,
        levels: {},
      };

      existing.levels[row.section] = row.level;
      bySubject.set(row.subjectId, existing);
    }

    return [...bySubject.values()];
  }

  /**
   * Собирает матрицу «проект × секция» для субъекта.
   *
   * Зеркало {@link matrixForProject} и живёт рядом с ним: это один срез
   * одной таблицы, и расходиться им нельзя. Проектов без выдач в ответе
   * нет — отсутствие доступа выражается отсутствием строки.
   */
  async matrixForSubject(subjectId: string): Promise<UserGrantRow[]> {
    const rows = await this.db
      .select({
        projectId: grants.projectId,
        projectName: projects.name,
        section: grants.section,
        level: grants.level,
      })
      .from(grants)
      .innerJoin(projects, eq(projects.id, grants.projectId))
      .where(eq(grants.subjectId, subjectId))
      .orderBy(projects.name);

    const byProject = new Map<string, UserGrantRow>();

    for (const row of rows) {
      const existing: UserGrantRow = byProject.get(row.projectId) ?? {
        projectId: row.projectId,
        projectName: row.projectName,
        levels: {},
      };

      existing.levels[row.section] = row.level;
      byProject.set(row.projectId, existing);
    }

    return [...byProject.values()];
  }
}
