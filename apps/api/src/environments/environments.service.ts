import {
  AuditSubjectKind,
  type EnvironmentCreate,
  type EnvironmentDetail,
  type EnvironmentDomainCreate,
  type EnvironmentMetadata,
  type EnvironmentUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { Environment } from '../db/schema';
import { EnvironmentsRepository } from './environments.repository';

/**
 * Окружения: изменения вместе с журналированием.
 *
 * Права проверяет репозиторий — он единственный путь к данным (спека 5.4).
 * Сервис добавляет запись в журнал в той же транзакции (спека 7.3).
 */
@Injectable()
export class EnvironmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: EnvironmentsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Возвращает окружения проекта в проекции по уровню доступа. */
  async list(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(EnvironmentMetadata | EnvironmentDetail)[]> {
    return this.repository.findForProject(subject, projectId);
  }

  /** Возвращает окружение в проекции по уровню доступа. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    return this.repository.findById(subject, projectId, environmentId);
  }

  /** Создаёт окружение. */
  async create(
    subject: RequestSubject,
    projectId: string,
    input: EnvironmentCreate,
  ): Promise<Environment> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.EnvironmentCreated,
        entityType: 'environment',
        entityId: created.id,
        projectId,
        metadata: { name: created.name, kind: created.kind },
      });

      return created;
    });
  }

  /** Изменяет окружение. В журнал попадают имена изменённых полей, но не значения. */
  async update(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    input: EnvironmentUpdate,
  ): Promise<Environment> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(subject, tx, projectId, environmentId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.EnvironmentUpdated,
        entityType: 'environment',
        entityId: environmentId,
        projectId,
        metadata: { name: updated.name, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /**
   * Заводит один адрес окружения.
   *
   * В журнал идёт та же правка доменов, что и при замене набора: снаружи
   * это по-прежнему правка окружения, и заводить ради одного адреса новое
   * действие журнала незачем.
   */
  async addDomain(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    input: EnvironmentDomainCreate,
  ): Promise<Environment> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.addDomain(subject, tx, projectId, environmentId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.EnvironmentUpdated,
        entityType: 'environment',
        entityId: environmentId,
        projectId,
        metadata: { name: updated.name, fields: ['domains'] },
      });

      return updated;
    });
  }

  /** Снимает один адрес окружения. Корень остаётся в реестре. */
  async removeDomain(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    domainId: string,
  ): Promise<Environment> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.removeDomain(
        subject,
        tx,
        projectId,
        environmentId,
        domainId,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.EnvironmentUpdated,
        entityType: 'environment',
        entityId: environmentId,
        projectId,
        metadata: { name: updated.name, fields: ['domains'] },
      });

      return updated;
    });
  }

  /** Удаляет окружение вместе с доменами. */
  async remove(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(subject, tx, projectId, environmentId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.EnvironmentDeleted,
        entityType: 'environment',
        entityId: environmentId,
        projectId,
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
