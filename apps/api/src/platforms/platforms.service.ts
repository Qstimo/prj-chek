import {
  AuditSubjectKind,
  type Platform,
  type PlatformCreate,
  type PlatformUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { ProjectPlatformRow } from '../db/schema';
import { PlatformsRepository } from './platforms.repository';

/**
 * Платформы проекта: изменения вместе с журналированием.
 *
 * Чтение пробрасывается в репозиторий как есть — проверку прав делает он.
 */
@Injectable()
export class PlatformsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: PlatformsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Платформы проекта по порядку. */
  async findForProject(subject: RequestSubject, projectId: string): Promise<Platform[]> {
    return this.repository.findForProject(subject, projectId);
  }

  /** Заводит платформу. */
  async create(
    subject: RequestSubject,
    projectId: string,
    input: PlatformCreate,
  ): Promise<ProjectPlatformRow> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.PlatformCreated,
        entityType: 'platform',
        entityId: created.id,
        projectId,
        metadata: { name: created.name, kind: created.kind },
      });

      return created;
    });
  }

  /** Правит имя платформы. */
  async update(
    subject: RequestSubject,
    projectId: string,
    platformId: string,
    input: PlatformUpdate,
  ): Promise<ProjectPlatformRow> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(subject, tx, projectId, platformId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.PlatformUpdated,
        entityType: 'platform',
        entityId: platformId,
        projectId,
        metadata: { name: updated.name },
      });

      return updated;
    });
  }

  /** Удаляет платформу вместе с её выпусками, тегами и связями. */
  async remove(subject: RequestSubject, projectId: string, platformId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(subject, tx, projectId, platformId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.PlatformDeleted,
        entityType: 'platform',
        entityId: platformId,
        projectId,
        // Имя и число выпусков — из удалённой строки: после удаления
        // взять их негде, а запись без них ссылается на то, чего не найти.
        metadata: { name: removed.name, releases: removed.releases },
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
