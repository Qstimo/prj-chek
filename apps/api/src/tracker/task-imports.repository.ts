import {
  AccessLevel,
  Section,
  TaskOrigin,
  weeekTaskLinkOf,
  type TrackerImportCandidate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import { projects, projectTasks, taskExports } from '../db/schema';

/** Импорт сериализуется по проекту, чтобы два подтверждения не создали дубли. */
@Injectable()
export class TaskImportsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  async known(subject: RequestSubject, projectId: string, executor: Executor = this.db) {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Roadmap,
      AccessLevel.Write,
      executor,
    );
    return executor
      .select({
        taskId: projectTasks.id,
        url: projectTasks.url,
        externalId: taskExports.externalId,
        externalUrl: taskExports.externalUrl,
      })
      .from(projectTasks)
      .leftJoin(taskExports, eq(taskExports.taskId, projectTasks.id))
      .where(eq(projectTasks.projectId, projectId));
  }

  async lock(subject: RequestSubject, tx: Transaction, projectId: string): Promise<void> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('no key update');
  }

  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    task: TrackerImportCandidate,
  ) {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write, tx);
    const [row] = await tx
      .insert(projectTasks)
      .values({ projectId, title: task.title, url: task.externalUrl, origin: TaskOrigin.Tracker })
      .returning();
    return row!;
  }
}

/** Сопоставляем пространство и id, в том числе ещё не связанную ручную ссылку. */
export function existingImportTask(
  rows: Awaited<ReturnType<TaskImportsRepository['known']>>,
  task: { externalId: string; externalUrl: string },
): string | null {
  const wanted = weeekTaskLinkOf(task.externalUrl);
  return (
    rows.find((row) => {
      const mirror = weeekTaskLinkOf(row.externalUrl);
      const manual = weeekTaskLinkOf(row.url);
      return (
        [mirror, manual].some(
          (link) =>
            link &&
            wanted &&
            link.workspaceId === wanted.workspaceId &&
            link.taskId === wanted.taskId,
        ) ||
      (row.externalId === task.externalId && mirror === null)
      );
    })?.taskId ?? null
  );
}
