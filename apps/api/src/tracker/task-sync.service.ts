import { type TaskSyncResult } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { applyTrackerCompletion } from './task-completion';
import { TaskExportsService } from './task-exports.service';
import {
  TaskExportsRepository,
  type TaskExportPollTarget,
  type TaskPollResult,
} from './task-exports.repository';
import { codeOf, groupsOf, targetOf } from './tracker-poll-groups';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import {
  TRACKER_SOURCE,
  type TrackerSource,
  type TrackerTaskState,
} from './tracker';
import { TrackerBindingMissingError, TrackerNotConfiguredError } from './tracker.errors';

@Injectable()
export class TaskSyncService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly exports: TaskExportsRepository,
    private readonly bindings: TrackerBindingsRepository,
    private readonly audit: AuditService,
    @Inject(TRACKER_SOURCE) private readonly trackers: TrackerSource,
    private readonly taskExports: TaskExportsService,
  ) {}

  async sync(subject: RequestSubject, projectId: string): Promise<TaskSyncResult> {
    await this.bindings.requireWrite(subject, projectId);
    const binding = await this.bindings.findForProject(subject, projectId);

    if (!binding) {
      throw new TrackerBindingMissingError();
    }

    const port = await this.trackers.current();

    if (!port.isEnabled) {
      throw new TrackerNotConfiguredError();
    }

    let failureCode = await this.taskExports.linkUnlinkedForProject(subject, projectId);
    const targets = await this.exports.listForProject(subject, projectId);
    const controller = new AbortController();
    let checked = 0;
    let found = 0;

    try {
      for (const group of groupsOf(targets)) {
        let states: TrackerTaskState[];

        try {
          states = await port.readTasks(targetOf(group[0]!), controller.signal);
        } catch (cause) {
          const pollFailureCode = codeOf(cause);
          failureCode ??= pollFailureCode;

          for (const target of group) {
            await this.write(target, { tracker: target.tracker, state: null, code: pollFailureCode });
          }

          checked += group.length;
          break;
        }

        const seen = new Map(states.map((state) => [state.externalId, state]));

        for (const target of group) {
          const state = seen.get(target.externalId) ?? null;

          await this.write(target, { tracker: target.tracker, state, code: null });
          checked += 1;
          if (state) found += 1;
        }
      }
    } finally {
      controller.abort();
    }

    return { checked, found, failureCode };
  }

  private async write(target: TaskExportPollTarget, result: TaskPollResult): Promise<void> {
    await this.db.transaction(async (tx) => {
      await applyTrackerCompletion(tx, target, result, this.audit);
      await this.exports.recordPolled(tx, target.taskId, result);
    });
  }
}
