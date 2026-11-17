import { AuditSubjectKind, type Tag } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { TagsRepository } from './tags.repository';

/**
 * Теги проектов: изменения вместе с журналированием.
 *
 * Чтение пробрасывается в репозиторий как есть — проверку прав делает он.
 */
@Injectable()
export class TagsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TagsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Теги видимых субъекту паспортов: словарь для подсказок. */
  async vocabulary(subject: RequestSubject): Promise<Tag[]> {
    return this.repository.vocabulary(subject);
  }

  /** Заменяет набор тегов проекта целиком. */
  async set(subject: RequestSubject, projectId: string, labels: string[]): Promise<Tag[]> {
    return this.db.transaction(async (tx) => {
      const result = await this.repository.set(subject, tx, projectId, labels);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ProjectTagsSet,
        entityType: 'project',
        entityId: projectId,
        projectId,
        // Новый набор, а не разница: теги — не секрет, а метка сводки, и
        // по записи обязано быть видно, чем проект стал. Разницу даёт
        // соседняя запись журнала.
        metadata: { tags: result.map((tag) => tag.label) },
      });

      return result;
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
