import type { AuditPage, AuditQuery } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { auditLog } from '../db/schema';

/**
 * Чтение журнала (спека 9.1).
 *
 * Только выборка: изменять и удалять записи нельзя ни из интерфейса,
 * ни из кода — роль базы таких прав не имеет (спека 4.7).
 */
@Injectable()
export class AuditQueryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Возвращает страницу журнала от новых записей к старым. */
  async query(filters: AuditQuery): Promise<AuditPage> {
    const conditions = buildConditions(filters);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(filters.limit)
      .offset(filters.offset);

    const [totals] = await this.db.select({ value: count() }).from(auditLog).where(where);

    return {
      entries: rows.map((row) => ({
        id: row.id,
        subjectId: row.subjectId,
        subjectKind: row.subjectKind,
        subjectLabel: row.subjectLabel,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        projectId: row.projectId,
        metadata: row.metadata ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total: totals?.value ?? 0,
    };
  }
}

/** Собирает условия выборки из фильтров. */
function buildConditions(filters: AuditQuery): SQL[] {
  const conditions: SQL[] = [];

  if (filters.subjectId) {
    conditions.push(eq(auditLog.subjectId, filters.subjectId));
  }

  if (filters.projectId) {
    conditions.push(eq(auditLog.projectId, filters.projectId));
  }

  if (filters.action) {
    conditions.push(eq(auditLog.action, filters.action));
  }

  if (filters.from) {
    conditions.push(gte(auditLog.createdAt, new Date(filters.from)));
  }

  if (filters.to) {
    conditions.push(lte(auditLog.createdAt, new Date(filters.to)));
  }

  return conditions;
}
