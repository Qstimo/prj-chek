import { type GrantMatrixRow, type GrantRevoke, type GrantSet, type Section } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { grants, subjects } from '../db/schema';

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

  /** Устанавливает уровень доступа для пары «субъект × секция». */
  async set(
    tx: Executor,
    projectId: string,
    grantedBy: string,
    input: GrantSet,
  ): Promise<void> {
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
}
