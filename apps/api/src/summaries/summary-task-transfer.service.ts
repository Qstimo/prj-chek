import { AuditSubjectKind, type SummaryTaskIds, type SummaryTransferResult } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { TasksRepository } from '../tasks/tasks.repository';
import { SummariesRepository } from './summaries.repository';

@Injectable()
export class SummaryTaskTransferService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly summaries: SummariesRepository,
    private readonly tasks: TasksRepository,
    private readonly audit: AuditService,
  ) {}

  async transfer(
    subject: RequestSubject,
    projectId: string,
    summaryId: string,
    input: SummaryTaskIds,
  ): Promise<SummaryTransferResult> {
    return this.db.transaction(async (tx) => {
      const rows = await this.summaries.tasksForTransfer(
        subject,
        tx,
        projectId,
        summaryId,
        input.taskIds,
      );
      const taskIds: string[] = [];
      const transferred: { draftId: string; taskId: string }[] = [];
      const actor: AuditActor = {
        id: subject.id,
        kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
        label: subject.label,
      };
      for (const row of rows) {
        if (row.taskId) {
          taskIds.push(row.taskId);
          continue;
        }
        const task = await this.tasks.createFromSummary(subject, tx, projectId, summaryId, {
          title: row.title,
          url: row.url,
          platformIds: row.platformIds,
        });
        transferred.push({ draftId: row.id, taskId: task.id });
        taskIds.push(task.id);
        await this.audit.record(tx, actor, {
          action: AuditAction.TaskCreated,
          entityType: 'task',
          entityId: task.id,
          projectId,
          metadata: { origin: task.origin, sourceSummaryId: summaryId },
        });
      }
      await this.summaries.markTransferred(subject, tx, projectId, summaryId, transferred);
      if (transferred.length)
        await this.audit.record(tx, actor, {
          action: AuditAction.SummaryTasksTransferred,
          entityType: 'summary',
          entityId: summaryId,
          projectId,
          metadata: { tasks: transferred.length },
        });
      return { taskIds };
    });
  }
}
