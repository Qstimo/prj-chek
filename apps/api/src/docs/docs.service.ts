import {
  AuditSubjectKind,
  type DocPageCreate,
  type DocPageDetail,
  type DocPageMetadata,
  type DocPageUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { DocPageRow } from '../db/schema';
import { DocsRepository } from './docs.repository';

/**
 * Документация: изменения вместе с журналированием.
 *
 * Содержимое страниц в журнал не попадает: оно не секрет, но объёмно
 * и в записи бесполезно — журналу достаточно заголовка и перечня полей.
 */
@Injectable()
export class DocsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: DocsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Список страниц в проекции по уровню. */
  async list(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(DocPageMetadata | DocPageDetail)[]> {
    return this.repository.findForProject(subject, projectId);
  }

  /** Одна страница в проекции по уровню. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    pageId: string,
  ): Promise<DocPageMetadata | DocPageDetail> {
    return this.repository.findById(subject, projectId, pageId);
  }

  /** Создаёт страницу. */
  async create(
    subject: RequestSubject,
    projectId: string,
    input: DocPageCreate,
  ): Promise<DocPageRow> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.DocPageCreated,
        entityType: 'doc_page',
        entityId: created.id,
        projectId,
        metadata: { title: created.title },
      });

      return created;
    });
  }

  /** Правит страницу. В журнал — заголовок и имена полей. */
  async update(
    subject: RequestSubject,
    projectId: string,
    pageId: string,
    input: DocPageUpdate,
  ): Promise<DocPageRow> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(subject, tx, projectId, pageId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.DocPageUpdated,
        entityType: 'doc_page',
        entityId: pageId,
        projectId,
        metadata: { title: updated.title, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет страницу. Заголовок остаётся в журнале. */
  async remove(subject: RequestSubject, projectId: string, pageId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(subject, tx, projectId, pageId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.DocPageDeleted,
        entityType: 'doc_page',
        entityId: pageId,
        projectId,
        metadata: { title: removed.title },
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
