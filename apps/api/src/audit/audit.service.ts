import { Injectable } from '@nestjs/common';

import type { Transaction } from '../db/db.types';
import { auditLog } from '../db/schema';
import type { AuditActor, AuditEntryInput } from './audit.types';

/**
 * Журнал действий (ТЗ 4.4).
 *
 * Транзакция передаётся параметром намеренно: запись обязана происходить
 * в той же транзакции, что и само действие, иначе журнал может потерять
 * след успешного изменения (спека 7.3).
 *
 * Вызывается из сервисов, а не из контроллеров: те же сервисы будут
 * вызываться из MCP-сервера и обработчика webhook на будущих этапах.
 */
@Injectable()
export class AuditService {
  /** Добавляет запись в журнал. Изменение и удаление записей не предусмотрены. */
  async record(tx: Transaction, actor: AuditActor, entry: AuditEntryInput): Promise<void> {
    await tx.insert(auditLog).values({
      subjectId: actor.id,
      subjectKind: actor.kind,
      subjectLabel: actor.label,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      projectId: entry.projectId ?? null,
      metadata: entry.metadata ?? null,
    });
  }
}
