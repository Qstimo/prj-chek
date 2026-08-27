import { AuditSubjectKind, type GrantMatrixRow, type GrantRevoke, type GrantSet } from '@cairn/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { users } from '../db/schema';
import { GrantsRepository } from './grants.repository';

/**
 * Выдачи доступа вместе с журналированием.
 *
 * Право управлять выдачами принадлежит только суперадмину и проверяется
 * guard'ом на контроллере (спека 4.3).
 */
@Injectable()
export class GrantsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: GrantsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Возвращает матрицу «субъект × секция» для проекта. */
  async matrix(projectId: string): Promise<GrantMatrixRow[]> {
    return this.repository.matrixForProject(projectId);
  }

  /** Устанавливает уровень доступа. */
  async set(actor: RequestSubject, projectId: string, input: GrantSet): Promise<void> {
    const grantedBy = await this.userIdOf(actor);

    await this.db.transaction(async (tx) => {
      await this.repository.set(tx, projectId, grantedBy, input);

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.GrantCreated,
        entityType: 'grant',
        projectId,
        metadata: { subjectId: input.subjectId, section: input.section, level: input.level },
      });
    });
  }

  /**
   * Отзывает выдачу.
   *
   * Пишет в журнал только состоявшийся отзыв: запись о снятии права,
   * которого не было, засоряет журнал и мешает расследованию.
   */
  async revoke(actor: RequestSubject, projectId: string, input: GrantRevoke): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.revoke(tx, projectId, input);

      if (!removed) {
        return;
      }

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.GrantRevoked,
        entityType: 'grant',
        projectId,
        metadata: { subjectId: input.subjectId, section: input.section },
      });
    });
  }

  /** Находит запись пользователя по субъекту: поле «кто выдал» ссылается на неё. */
  private async userIdOf(subject: RequestSubject): Promise<string> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.subjectId, subject.id))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user.id;
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
