import {
  AuditSubjectKind,
  ChronicleSource,
  type ChronicleDetail,
  type ChronicleEntryCreate,
  type ChronicleEntryUpdate,
  type ChronicleMetadata,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { ChronicleEntry } from '../db/schema';
import { ChronicleRepository } from './chronicle.repository';

/**
 * Хроника: изменения вместе с журналированием.
 *
 * Права проверяет репозиторий (спека 5.4); сервис добавляет запись
 * в журнал в той же транзакции (спека 7.3). Тем же сервисом пишет
 * приёмный канал — от лица машинного субъекта.
 */
@Injectable()
export class ChronicleService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: ChronicleRepository,
    private readonly audit: AuditService,
  ) {}

  /** Лента проекта в проекции по уровню доступа. */
  async list(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(ChronicleMetadata | ChronicleDetail)[]> {
    return this.repository.findForProject(subject, projectId);
  }

  /** Одна запись в проекции по уровню доступа. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    entryId: string,
  ): Promise<ChronicleMetadata | ChronicleDetail> {
    return this.repository.findById(subject, projectId, entryId);
  }

  /** Создаёт запись. Содержимое в журнал не попадает. */
  async create(
    subject: RequestSubject,
    projectId: string,
    input: ChronicleEntryCreate,
    source: ChronicleSource = ChronicleSource.Manual,
  ): Promise<ChronicleEntry> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, input, source);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ChronicleEntryCreated,
        entityType: 'chronicle_entry',
        entityId: created.id,
        projectId,
        metadata: { title: created.title, occurredOn: created.occurredOn, source },
      });

      return created;
    });
  }

  /** Изменяет запись. В журнал попадают имена полей, но не значения. */
  async update(
    subject: RequestSubject,
    projectId: string,
    entryId: string,
    input: ChronicleEntryUpdate,
  ): Promise<ChronicleEntry> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(subject, tx, projectId, entryId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ChronicleEntryUpdated,
        entityType: 'chronicle_entry',
        entityId: entryId,
        projectId,
        metadata: { title: updated.title, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет запись. Заголовок и дата сохраняются в журнале. */
  async remove(subject: RequestSubject, projectId: string, entryId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(subject, tx, projectId, entryId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ChronicleEntryDeleted,
        entityType: 'chronicle_entry',
        entityId: entryId,
        projectId,
        metadata: { title: removed.title, occurredOn: removed.occurredOn },
      });
    });
  }
}

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
