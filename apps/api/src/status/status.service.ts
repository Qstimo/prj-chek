import {
  AuditSubjectKind,
  type ProjectStatus,
  type StatusSummaryRow,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { StatusRepository } from './status.repository';
import { StatusRunnerService } from './status-runner.service';

/** Статусы: агрегаты для интерфейса и ручной запуск проверок. */
@Injectable()
export class StatusService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: StatusRepository,
    private readonly runner: StatusRunnerService,
    private readonly audit: AuditService,
  ) {}

  /** Агрегированный статус проекта. */
  async projectStatus(subject: RequestSubject, projectId: string): Promise<ProjectStatus> {
    return this.repository.statusForProject(subject, projectId);
  }

  /** Сводка по видимым проектам. */
  async summary(subject: RequestSubject): Promise<StatusSummaryRow[]> {
    return this.repository.summary(subject);
  }

  /**
   * Ручной запуск всех проверок.
   *
   * В отличие от фонового цикла — действие субъекта, и потому в журнале.
   */
  async runNow(subject: RequestSubject): Promise<void> {
    await this.runner.runAll();

    await this.db.transaction(async (tx) => {
      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.StatusCheckRun,
        entityType: 'status_check',
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
