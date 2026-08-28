import {
  AuditSubjectKind,
  type PublicRoadmap,
  type RoadmapCheckpointCreate,
  type RoadmapCheckpointUpdate,
  type RoadmapResponse,
  type RoadmapVersionCreate,
  type RoadmapVersionUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { RoadmapCheckpointRow, RoadmapVersionRow } from '../db/schema';
import { RoadmapRepository } from './roadmap.repository';

/**
 * Роадмап: изменения вместе с журналированием.
 *
 * Формулировки чекпоинтов попадают в журнал — в отличие от значений
 * переменных они не секрет. Публичное чтение журнала не оставляет:
 * у анонимного читателя нет субъекта.
 */
@Injectable()
export class RoadmapService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: RoadmapRepository,
    private readonly audit: AuditService,
  ) {}

  /** Роадмап проекта по уровню доступа. */
  async get(subject: RequestSubject, projectId: string): Promise<RoadmapResponse> {
    return this.repository.findForProject(subject, projectId);
  }

  /** Публичный роадмап по токену. */
  async publicRoadmap(token: string): Promise<PublicRoadmap | null> {
    return this.repository.publicRoadmap(token);
  }

  /** Токен публичной ссылки проекта либо `null`. */
  async findPublicLink(projectId: string): Promise<string | null> {
    return this.repository.findPublicLink(projectId);
  }

  /** Создаёт версию. */
  async createVersion(
    subject: RequestSubject,
    projectId: string,
    input: RoadmapVersionCreate,
  ): Promise<RoadmapVersionRow> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.createVersion(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapVersionCreated,
        entityType: 'roadmap_version',
        entityId: created.id,
        projectId,
        metadata: { label: created.label },
      });

      return created;
    });
  }

  /** Правит версию. */
  async updateVersion(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    input: RoadmapVersionUpdate,
  ): Promise<RoadmapVersionRow> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.updateVersion(subject, tx, projectId, versionId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapVersionUpdated,
        entityType: 'roadmap_version',
        entityId: versionId,
        projectId,
        metadata: { label: updated.label, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет версию вместе с чекпоинтами. */
  async removeVersion(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.removeVersion(subject, tx, projectId, versionId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapVersionDeleted,
        entityType: 'roadmap_version',
        entityId: versionId,
        projectId,
        metadata: { label: removed.label },
      });
    });
  }

  /** Создаёт чекпоинт. */
  async createCheckpoint(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    input: RoadmapCheckpointCreate,
  ): Promise<RoadmapCheckpointRow> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.createCheckpoint(
        subject,
        tx,
        projectId,
        versionId,
        input,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.CheckpointCreated,
        entityType: 'checkpoint',
        entityId: created.id,
        projectId,
        metadata: { title: created.title },
      });

      return created;
    });
  }

  /** Правит чекпоинт. */
  async updateCheckpoint(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    checkpointId: string,
    input: RoadmapCheckpointUpdate,
  ): Promise<RoadmapCheckpointRow> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.updateCheckpoint(
        subject,
        tx,
        projectId,
        versionId,
        checkpointId,
        input,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.CheckpointUpdated,
        entityType: 'checkpoint',
        entityId: checkpointId,
        projectId,
        metadata: { title: updated.title, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет чекпоинт. */
  async removeCheckpoint(
    subject: RequestSubject,
    projectId: string,
    versionId: string,
    checkpointId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.removeCheckpoint(
        subject,
        tx,
        projectId,
        versionId,
        checkpointId,
      );

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.CheckpointDeleted,
        entityType: 'checkpoint',
        entityId: checkpointId,
        projectId,
        metadata: { title: removed.title },
      });
    });
  }

  /** Включает публикацию и возвращает токен. */
  async publish(subject: RequestSubject, projectId: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const token = await this.repository.publish(tx, projectId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapPublished,
        entityType: 'roadmap_public_link',
        projectId,
      });

      return token;
    });
  }

  /** Отключает публикацию: прежняя ссылка гаснет. */
  async unpublish(subject: RequestSubject, projectId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.repository.unpublish(tx, projectId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.RoadmapUnpublished,
        entityType: 'roadmap_public_link',
        projectId,
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
