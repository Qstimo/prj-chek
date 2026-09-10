import type {
  AuditSubjectKind,
  ServerCreate,
  ServerDetail,
  ServerMap,
  ServerRow,
  ServerUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { Server } from '../db/schema';
import { ServersRepository } from './servers.repository';

/**
 * Серверы: изменения вместе с журналированием.
 *
 * Запись в журнал идёт той же транзакцией, что и изменение: иначе журнал
 * рассказывал бы о правках, которых не случилось. `projectId` у записей
 * пуст — сервер межпроектен и ни одному проекту не принадлежит.
 */
@Injectable()
export class ServersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: ServersRepository,
    private readonly audit: AuditService,
  ) {}

  /** Реестр серверов. */
  async list(): Promise<ServerRow[]> {
    return this.repository.list();
  }

  /** Данные карты размещения. */
  async map(): Promise<ServerMap> {
    return this.repository.map();
  }

  /** Сервер вместе с размещёнными окружениями. */
  async findById(id: string): Promise<ServerDetail> {
    return this.repository.findById(id);
  }

  /** Заводит сервер. */
  async create(subject: RequestSubject, input: ServerCreate): Promise<Server> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(tx, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ServerCreated,
        entityType: 'server',
        entityId: created.id,
        metadata: { name: created.name },
      });

      return created;
    });
  }

  /** Меняет сервер. В журнал попадают имена изменённых полей, но не значения. */
  async update(subject: RequestSubject, id: string, input: ServerUpdate): Promise<Server> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(tx, id, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ServerUpdated,
        entityType: 'server',
        entityId: id,
        metadata: { name: updated.name, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет сервер. */
  async remove(subject: RequestSubject, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(tx, id);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ServerDeleted,
        entityType: 'server',
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
