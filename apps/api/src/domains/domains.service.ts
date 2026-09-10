import type {
  AuditSubjectKind,
  DomainCreate,
  DomainDetail,
  DomainMap,
  DomainRow,
  DomainUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { Domain } from '../db/schema';
import { DomainsRepository } from './domains.repository';

/**
 * Домены: изменения вместе с журналированием.
 *
 * Запись в журнал идёт той же транзакцией, что и изменение. `projectId`
 * пуст — корень межпроектен и ни одному проекту не принадлежит.
 */
@Injectable()
export class DomainsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: DomainsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Реестр корневых доменов. */
  async list(): Promise<DomainRow[]> {
    return this.repository.list();
  }

  /** Данные карты доменов. */
  async map(): Promise<DomainMap> {
    return this.repository.map();
  }

  /** Корень вместе с поддоменами. */
  async findById(id: string): Promise<DomainDetail> {
    return this.repository.findById(id);
  }

  /** Заводит корень. */
  async create(subject: RequestSubject, input: DomainCreate): Promise<Domain> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(tx, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.DomainCreated,
        entityType: 'domain',
        entityId: created.id,
        metadata: { name: created.name },
      });

      return created;
    });
  }

  /** Меняет корень. В журнал попадают имена изменённых полей, но не значения. */
  async update(subject: RequestSubject, id: string, input: DomainUpdate): Promise<Domain> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(tx, id, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.DomainUpdated,
        entityType: 'domain',
        entityId: id,
        metadata: { name: updated.name, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет корень. */
  async remove(subject: RequestSubject, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(tx, id);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.DomainDeleted,
        entityType: 'domain',
        entityId: id,
        metadata: { name: removed.name },
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
